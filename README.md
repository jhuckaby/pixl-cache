<details><summary>Table of Contents</summary>

<!-- toc -->
- [Overview](#overview)
	* [Features](#features)
	* [Benchmarks](#benchmarks)
- [Usage](#usage)
	* [Overflow](#overflow)
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

Internally the cache is implemented as a combination of a hash and a double-linked list.  When items are accessed (added, replaced or fetched) they are promoted to the front of the linked list.  When the max size (keys or bytes) is exceeded, items are dropped from the back of the list.

## Features

- Simple and straightforward API
- Fast and stable
- Low memory overhead
- Predictable results on overflow
- Can expire based on key count or byte count
- Event listener for expired keys
- Can store metadata along with cache objects
- No dependencies

## Benchmarks

Note that while pixl-cache may be the fastest and use the least memory among the packages tested, it also has the least amount of features.  The other packages listed here are all awesome, and you should consider using them.  Most have been battle-tested in production for years, whereas pixl-cache has not.

Read and write 1,000,000 keys (shorter times are better):

| Package | Version | Write Time | Read Time | Max Memory Usage |
|---------|---------|------------|-----------|------------------|
| [stale-lru-cache](https://github.com/cyberthom/stale-lru-cache) | v5.1.1 | 5531 ms | 216 ms | 147.9 MB |
| [fast-lru](https://github.com/playgroundtheory/fast-lru) | v3.0.1 | 5816 ms | 149 ms | 142.1 MB |
| [lru-cache](https://github.com/isaacs/node-lru-cache) | v5.1.1 | 5263 ms | 62 ms | 140.7 MB | 
| [node-cache](https://github.com/mpneuried/nodecache) | v3.1.0 | 6097 ms | 713 ms | 221.5 MB |
| [pixl-cache](https://github.com/jhuckaby/pixl-cache) | v1.0.4 | 4253 ms | 37 ms | 128.1 MB |

Tests performed on a MacBook Pro 2016 (2.9 GHz Intel Core i7) with Node v10.14.1.

# Usage

Use [npm](https://www.npmjs.com/) to install the module:

```
npm install pixl-cache
```

Here is a simple usage example:

```js
const LRU = require('pixl-cache');
var cache = new LRU({ maxItems: 10 });

cache.set( 'key1', "Simple String" );
cache.set( 'key2', Buffer.alloc(10) );
cache.set( 'key3', { complex: { item: 1234 } } );
cache.set( 'key4', true );

var value = cache.get( 'key1' );
cache.delete( 'key2' );
```

## Overflow

pixl-cache can handle overflow in two different ways: by enforcing a maximum number of items, and/or a maximum number of bytes.  When either of these limits are exceeded, the least recently used object(s) will be expunged.  These limits can be passed to the class constructor like so:

```js
var cache = new LRU({ 
	maxItems: 1000, 
	maxBytes: 1048576
});
```

This would allow up to 1,000 items or 1 MB of total value length, whichever is reached first.  When using `maxBytes` the cache needs to calculate the size of your objects.  By default, it does this simply by counting the `length` property of your values passed to `set()`.  If you use strings or buffers, this is automatic:

```js
cache.set( 'key1', "ABCDEFGHIJ" ); // length 10
cache.set( 'key2', Buffer.alloc(10) ); // length 10
```

Both of these would add 10 to the total byte weight.  However, you may want to specify your own custom length, especially if you are storing objects or other non-string non-buffer values.  Also, it should be pointed out that string length is **not** byte length (strings are internally represented as 16-bit in Node.js, so it's basically double).  Suffice to say, you may want to specify your own custom lengths.

To do this, pass a metadata object to `set()` as the 3rd argument, and include an explicit `length` property therein:

```js
cache.set( 'key1', "ABCDEFGHIJ", { length: 20 } );
```

This would record the length of the record as 20 bytes.

# API

## constructor

```js
const LRU = require('pixl-cache');
var cache = new LRU();
```

The constructor creates a cache instance.  You can optionally pass an object containing any of these properties:

| Property | Default | Description |
|----------|---------|-------------|
| `maxItems` | `0` | Specifies the maximum number of objects allowed in the cache, before it starts expunging the least recently used. |
| `maxBytes` | `0` | Specifies the maximum value bytes allowed in the cache, before it starts expunging the least recently used. |

If you omit either property, they default to `0` which is infinite.  If both are specified, whichever one kicks in first will expire keys.

## set

```js
cache.set( 'key1', "Value 1" );
```

The `set()` method adds or replaces a single object in the cache, given a key and value.  The key is assumed to be a string, but the value can be anything.  Anytime an object is added or replaced, it becomes the most recently used.

Adding new keys may cause the least recently used object(s) to be expired from the cache.

You can optionally pass an object containing arbitrary metadata as the 3rd argument to `set()`.  This is stored in the internal cache database, and does not add to the total byte count.  Example:

```js
cache.set( 'key1', "Value 1", { mydate: Date.now() } );
```

Please make sure your metadata object does *not* include the following four keys: `key`, `value`, `next` or `prev`.  Those are for internal cache use.  You can, however, include a `length` key in the metadata object, which overrides the default length calculation for the object.

Subsequent calls to `set()` replacing a key with differing metadata is shallow-merged.  If a subsequent call omits metadata entirely, the original data is preserved.

You can use [getMeta()](#getmeta) to retrieve cache objects including your metadata.

Note that if you want to store either `null` or `undefined` as cache values, you *must* specify a non-zero `length` in the metadata object.  Otherwise pixl-cache will throw an exception trying to compute the length.

## get

```js
var value = cache.get( 'key1' );
```

The `get()` method fetches a value given a key.  If the key is not found in the cache the return value will be `undefined`.  Note that when fetching any key, that object becomes the most recently used.

Fetching keys will never cause any object to be expunged from the cache.

## getMeta

```js
var item = cache.getMeta( 'key1' );
var mydate = item.mydate; // custom metadata
```

The `getMeta()` method fetches the internal cache object wrapper given its key, which includes any metadata you may have specified when you called `set()`.  The object will always have the following keys, along with your metadata merged in:

| Key | Description |
|-----|-------------|
| `key` | The cache object key, as passed to `set()`. |
| `value` | The cache object value, pas passed to `set()` and returned by `get()`. |
| `next` | A pointer to the *next* cache object in the linked list.  Please do not touch. |
| `prev` | A pointer to the *previous* cache object in the linked list.  Please do not touch. |

## has

```js
if (cache.has('key1')) console.log("YES!");
```

The `has()` method checks if a specified key exists in the cache, and returns `true` or `false`.  This does **not** cause the object to get promoted to the most recently used.  It is more of a "peek".

## delete

```js
cache.delete( 'key1' );
```

The `delete()` method deletes the specified key from the cache.  If successful, this returns `true`.  If the key was not found it returns `false`.

## clear

```js
cache.clear();
```

The `clear()` method clears the **entire** cache, deleting all keys.  It does not reset any configuration properties.

## getStats

```js
var stats = cache.getStats();
```

The `getStats()` method returns an object containing some basic statistics about the cache, including the current total keys, total bytes, fullness percentage estimate, and the 10 hottest (most used) keys.  Example response, formatted as JSON:

```json
{
	"count": 158,
	"bytes": 15098,
	"full": "15.8%",
	"hotKeys": [
		"index/ontrack/_data/2665",
		"index/ontrack/_data/2664",
		"index/ontrack/_data/2663",
		"index/ontrack/_data/2662",
		"index/ontrack/_data/2661",
		"index/ontrack/_data/2660",
		"index/ontrack/_data/2659",
		"index/ontrack/_data/2658",
		"index/ontrack/_data/2657",
		"index/ontrack/_data/2656"
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

The `expire` event is emitted when the cache is about to expire the least recently used object, either due to total key count or byte count.  The event listener will be passed two arguments, the item being expired, and a reason:

```js
cache.on( 'expire', function(item, reason) {
	console.log(`Cache expired ${item.key} because of ${reason}.`);
});
```

The `item` is an object containing the original `key` and `value` as originally passed to `set()`, along with any custom metadata if applicable.  You can use this hook to persist data to disk, for example.

The `reason` will be either `count` (expired due to key count), or `bytes` (expired due to total byte count).  It is always a string.

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

## Unit Tests

When installing locally for development, [pixl-unit](https://github.com/jhuckaby/pixl-unit) will be installed as a dev dependency.  Then, to run the unit tests, issue this command:

```
npm test
```

# License

**The MIT License (MIT)**

*Copyright (c) 2019 Joseph Huckaby.*

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
