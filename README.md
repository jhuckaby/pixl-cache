<details><summary>Table of Contents</summary>

<!-- toc -->
- [Overview](#overview)
	* [Features](#features)
	* [Benchmarks](#benchmarks)
- [Usage](#usage)
	* [Overflow](#overflow)
	* [Expiration](#expiration)
- [API](#api)
	* [constructor](#constructor)
	* [set](#set)
	* [get](#get)
	* [getMeta](#getmeta)
	* [has](#has)
	* [delete](#delete)
	* [clear](#clear)
	* [getStats](#getstats)
	* [on](#on)
	* [Events](#events)
		+ [expire](#expire)
	* [Properties](#properties)
		+ [items](#items)
		+ [count](#count)
		+ [bytes](#bytes)
- [Development](#development)
	* [Unit Tests](#unit-tests)
- [License](#license)

</details>

# Overview

**pixl-cache** is a very simple LRU (Least Recently Used) cache module for Node.js.  It works like a hash map with `set()` and `get()` methods, but when it detects an overflow (configurable by total keys or total bytes) it automatically expunges the least recently accessed objects from the cache.  It is fast, stable, and has no dependencies.

Internally the cache is implemented as a combination of a hash map and a double-linked list.  When items are accessed (added, replaced or fetched) they are promoted to the front of the linked list.  When the max size (keys or bytes) is exceeded, items are dropped from the back of the list.  Items can also have an optional max age (i.e. expiration date).

## Features

- Simple and straightforward API
- Fast and stable
- Low memory overhead
- Predictable results on overflow
- Can expire based on key count or byte count
- Optional expiration date for items
- Event listener for ejecting expired items
- Can store custom metadata along with cache objects
- No dependencies

## Benchmarks

Note that while pixl-cache may be the fastest and use the least memory among the packages tested, it also has the least amount of features.  The other packages listed here are all awesome, and you should consider using them.  Most have been battle-tested in production for years, whereas pixl-cache has not.

Read and write 1,000,000 keys (shorter times are better):

| Package | Version | Write Time | Read Time | Max Memory Usage |
|---------|---------|------------|-----------|------------------|
| [stale-lru-cache](https://github.com/cyberthom/stale-lru-cache) | v5.1.1 | 4096 ms | 146 ms | 155.6 MB |
| [fast-lru](https://github.com/playgroundtheory/fast-lru) | v3.0.1 | 4097 ms | 121 ms | 146.1 MB |
| [lru-cache](https://github.com/isaacs/node-lru-cache) | v5.1.1 | 3821 ms | 43 ms | 154.1 MB |
| [node-cache](https://github.com/mpneuried/nodecache) | v3.1.0 | 3872 ms | 240 ms | 242.9 MB |
| [pixl-cache](https://github.com/jhuckaby/pixl-cache) | v1.0.6 | 3308 ms | 23 ms | 143.9 MB |

Tests performed on a MacBook Pro 2019 (8 core 2.4 GHz Intel Core i9) with Node v10.14.1.

# Usage

Use [npm](https://www.npmjs.com/) to install the module:

```
npm install pixl-cache
```

Here is a simple usage example, enforcing 5 max items:

```js
const LRU = require('pixl-cache');
let cache = new LRU({ maxItems: 5 });

cache.set( 'key1', "Simple String" );
cache.set( 'key2', Buffer.alloc(10) );
cache.set( 'key3', { complex: { item: 1234 } } );
cache.set( 'key4', true );
cache.set( 'key5', "Cache is full now" );
cache.set( 'key6', "Oops, key1 is gone now");

let value = cache.get( 'key1' );
// value === undefined (key1 got expunged)

cache.delete( 'key2' ); // manual delete

if (cache.has('key3')) {
	// check if key exists (true)
}

cache.clear(); // wipe entire cache
```

Instead of setting a maximum item count, you can set a total byte count:

```js
let cache = new LRU({ maxBytes: 1024 * 1024 }); // 1 MB
cache.set( 'key1', Buffer.alloc(1024 * 512) ); // 50% full here
cache.set( 'key2', Buffer.alloc(1024 * 256) ); // 75% full here
```

Or expire objects by their age in the cache:

```js
let cache = new LRU({ maxAge: 86400 }); // 24 hours
cache.set( 'key1', "Expires tomorrow!" );
```

## Overflow

pixl-cache can handle overflow in two different ways: by enforcing a maximum number of items, and/or a maximum number of bytes.  When either of these limits are exceeded, the least recently used object(s) will be expunged.  These limits can be passed to the class constructor like so:

```js
let cache = new LRU({ 
	maxItems: 1000, 
	maxBytes: 1048576
});
```

This would allow up to 1,000 items or 1 MB of total value length, whichever is reached first.  When using `maxBytes` the cache needs to calculate the size of your objects.  The byte size includes both the key and the value.  The process is automatic if you use simple primitive value types such as strings, buffers, numbers or booleans.  Examples:

```js
cache.set( 'key1', "ABCDEFGHIJ" ); // 20 bytes + 8 for key
cache.set( 'key2', Buffer.alloc(10) ); // 10 bytes + 8 for key
cache.set( 'key3', 12345 ); // 8 bytes + 8 for key
cache.set( 'key4', true ) ; // 4 bytes + 8 for key
```

Note that string length does **not** equal byte length.  This is because strings are internally represented as 16-bits (2 bytes) per character in Node.js, so they're basically double size.  That is why the 10-character string `ABCDEFGHIJ` is actually 20 bytes in memory.

The byte length of *object* values is not automatically calculated.  Meaning, if you pass an object as a value, its byte count is read from a `length` property if it exists (i.e. for buffers), or if not found it defaults to `0`.  So, you may want to specify your own custom lengths in certain cases, especially if you are storing objects in the cache.  To do this, pass a metadata object to `set()` as the 3rd argument, and include an explicit `length` property therein:

```js
cache.set( 'key1', { "name": "Joe" }, { length: 200 } );
```

This would record the length of the object value as 200 bytes.

## Expiration

In addition to expiring the least recently used objects when the cache is full, objects can also expire based on age.  You can specify a `maxAge` configuration property when constructing your cache:

```js
let cache = new LRU({ maxAge: 86400 }); // 24 hours
```

And in this case all items added to the cache will be expired after 24 hours.  Replacing existing items resets their age clock.  Each item has its own internal expiration date, and if that date comes to pass, fetching the item will immediately cause it to be deleted, and return `undefined`.  Note that items are not "actively deleted" based on an interval timer, but rather expired items delete themselves on fetch (or may be expunged for other reasons, i.e. `maxItems` and/or `maxBytes`).

You can specify a custom expiration date for your items individually, by passing a metadata object to `set()` as the 3rd argument, and including an explicit `expires` property therein:

```js
let someFutureDate = ( Date.now() / 1000 ) + 86400; // 24 hours from now
cache.set( 'key1', "ABCDEFGHIJ", { expires: someFutureDate } );
```

The `expires` property needs to be an Epoch timestamp, as shown above.  You do not need to enable `maxAge` in order to use the custom `expires` property.  It works with any combination of configuration options, and overrides `maxAge` if it is also set.  If you set an `expires` date in the past, the key is immediately deleted upon the next fetch.

# API

## constructor

```js
const LRU = require('pixl-cache');
let cache = new LRU();
```

The constructor creates a cache instance.  You can optionally pass an object containing any of these properties:

| Property | Default | Description |
|----------|---------|-------------|
| `maxItems` | `0` | Specifies the maximum number of objects allowed in the cache, before it starts expunging the least recently used. |
| `maxBytes` | `0` | Specifies the maximum value bytes allowed in the cache, before it starts expunging the least recently used. |
| `maxAge` | `0` | Specifies the default maximum age in seconds for all keys added to the cache, before they are deleted on fetch. |

The default of `0` means infinite.  If multiple configuration properties are specified, whichever one kicks in first will expire keys.  Here is an example with all properties set:

```js
let cache = new LRU({
	maxItems: 1000,
	maxBytes: 1048576, // 1 MB
	maxAge: 86400 // 24 hours
});
```

## set

```js
cache.set( 'key1', "Value 1" );
```

The `set()` method adds or replaces a single object in the cache, given a key and value.  The key is assumed to be a string, but the value can be anything.  Anytime an object is added or replaced, it becomes the most recently used.

Adding new keys may cause the least recently used object(s) to be expired from the cache.

You can optionally pass an object containing arbitrary metadata as the 3rd argument to `set()`.  This is stored in the internal cache database, and does not add to the total byte count.  Example:

```js
cache.set( 'key1', "Value 1", { mytag: "frog" } );
```

Please make sure your metadata object does *not* include the following four keys: `key`, `value`, `next` or `prev`.  Those are for internal cache use.  You can, however, include a `length` key in the metadata object, which overrides the default length calculation for the object, and/or an `expires` key, which sets the expiration date for the key (Epoch timestamp).

Subsequent calls to `set()` replacing a key with differing metadata is shallow-merged.  If a subsequent call omits metadata entirely, the original data is preserved.

You can use [getMeta()](#getmeta) to retrieve cache objects including your metadata.

Note that if you want to store either `null` or `undefined` as cache values, you *must* specify a non-zero `length` in the metadata object.  Otherwise pixl-cache will throw an exception trying to compute the length.

## get

```js
let value = cache.get( 'key1' );
```

The `get()` method fetches a value given a key.  If the key is not found in the cache (or it exists but is expired) the return value will be `undefined`.  Note that when fetching any key, that object becomes the most recently used.

If the item is fetched on or after its expiration date (i.e. when using `maxAge` or setting an explicit date), it will be deleted, and the call will return `undefined`.

## getMeta

```js
let item = cache.getMeta( 'key1' );
let mytag = item.mytag; // custom metadata
```

The `getMeta()` method fetches the internal cache object wrapper given its key, which includes any metadata you may have specified when you called `set()`.  The object will always have the following properties, along with your metadata merged in:

| Key | Description |
|-----|-------------|
| `key` | The raw cache object key, as passed to `set()`. |
| `value` | The raw cache object value, as passed to `set()` and returned by `get()`. |
| `next` | A pointer to the *next* cache object in the linked list.  Please do not touch. |
| `prev` | A pointer to the *previous* cache object in the linked list.  Please do not touch. |

The metadata object may also have one or both of these additional properties:

| Key | Description |
|-----|-------------|
| `length` | The length of the object's `value`, if it was provided explicitly when `set()` was called, or calculated automatically. |
| `expires` | The expiration date of the object as an Epoch timestamp, if the `maxAge` configuration property is set, or a custom `expires` was provided when `set()` was called. |

## has

```js
if (cache.has('key1')) console.log("key1 is present!");
```

The `has()` method checks if a specified key exists in the cache, and returns `true` or `false`.  This does **not** cause the object to get promoted to the most recently used.  It is more of a "peek".

Note that if a cache object is technically still present but expired, the return value of this call will be `false`.  This is because the item is "effectively" deleted at this point (i.e. it can no longer be fetched), so we properly represent what would happen if you tried to call `get()` after calling `has()`.

## delete

```js
cache.delete( 'key1' );
```

The `delete()` method deletes the specified key from the cache.  If successful, this returns `true`.  If the key was not found it returns `false`.  This will return `true` (success) for deleting expired keys.

## clear

```js
cache.clear();
```

The `clear()` method clears the **entire** cache, deleting all objects.  It does not reset any configuration properties, however.

## getStats

```js
let stats = cache.getStats();
```

The `getStats()` method returns an object containing some basic statistics about the cache, including the current total keys, total bytes, fullness percentage estimate, and the 10 hottest (most used) keys.  Example response, formatted as JSON:

```json
{
	"count": 158,
	"bytes": 15098,
	"full": "15.8%",
	"hotKeys": [
		"index/myapp/data/2665",
		"index/myapp/data/2664",
		"index/myapp/data/2663",
		"index/myapp/data/2662",
		"index/myapp/data/2661",
		"index/myapp/data/2660",
		"index/myapp/data/2659",
		"index/myapp/data/2658",
		"index/myapp/data/2657",
		"index/myapp/data/2656"
	]
}
```

## on

```js
cache.on( 'expire', function(item, reason) {
	console.log(`Cache expired ${item.key} because of ${reason}.`);
});
```

The pixl-cache class inherits from Node's [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter), so it has all those methods available including [on()](https://nodejs.org/api/events.html#events_emitter_on_eventname_listener) and [off()](https://nodejs.org/api/events.html#events_emitter_off_eventname_listener).

## Events

The following events are emitted:

### expire

The `expire` event is emitted when the cache is about to expire the least recently used object, either due to total key count, byte count or age.  The event listener will be passed two arguments, the item being expired, and a reason:

```js
cache.on( 'expire', function(item, reason) {
	console.log(`Cache expired ${item.key} because of ${reason}.`);
});
```

The `item` is an object containing the original `key` and `value` as originally passed to `set()`, along with any custom metadata if applicable.  It is the same object that [getMeta()](#getmeta) returns.  You can use the `expire` hook to persist data to disk, for example.

The `reason` will be either `count` (expired due to total key count), `bytes` (expired due to total byte count), or `age` (expired due to age).  It is always a string.

## Properties

The following properties are available on pixl-cache class instances:

### items

The `items` property is a hash containing all the objects currently in the cache, keyed by their actual keys.  Please do not directly manipulate this object, as it will become out of sync with the internal linked list.  However, you are free to read from it.

### count

The `count` property contains the current total key count in the cache.

### bytes

The `bytes` property contains the current total byte count in the cache.

# Development

To install pixl-cache for development, run these commands:

```
git clone https://github.com/jhuckaby/pixl-cache.git
cd pixl-cache
npm install
```

The `npm install` is only needed for running unit tests.

## Unit Tests

When installing locally for development, [pixl-unit](https://github.com/jhuckaby/pixl-unit) will be installed as a dev dependency.  Then, to run the unit tests, issue this command:

```
npm test
```

# License

**The MIT License (MIT)**

*Copyright (c) 2019 - 2025 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
