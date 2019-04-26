<details><summary>Table of Contents</summary>

<!-- toc -->

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
| [pixl-cache](https://github.com/jhuckaby/pixl-cache) | v1.0.0 | 4253 ms | 37 ms | 128.1 MB |

Tests performed on a MacBook Pro 2016 (2.9 GHz Intel Core i7) with Node v10.14.1.

# Usage

Use [npm](https://www.npmjs.com/) to install the module:

```
npm install pixl-cache
```

Here is a simple usage example:

```js
const LRU = require('pixl-cache');
const cache = new LRU({ maxItems: 10 });

cache.set( 'key1', "Value 1" );
cache.set( 'key2', { complex: { item: 1234 } } );

var value = cache.get( 'key1' );
cache.delete( 'key2' );
```

# API

## constructor

```js
const LRU = require('pixl-cache');
const cache = new LRU();
```

The constructor creates a cache instance.  You can optionally pass an object containing any of these properties:

| Property | Default | Description |
|----------|---------|-------------|
| `maxItems` | `0` | Specifies the maximum number of objects allowed in the cache, before it starts expiring the least recently used. |
| `maxBytes` | `0` | Specifies the maximum value bytes allowed in the cache, before it starts expiring the least recently used. |

If you omit either property, they default to `0` which is infinite.  If both are specified, whichever one kicks in first will expire keys.

Note that if you set a non-zero `maxBytes` to govern the maximum bytes in the cache, your values are expected to have a `length` property (Strings or Buffers are fine).  Anything without a `length` property is assumed to have a length of 0, and doesn't increment the total byte count.

## set

```js
cache.set( 'key1', "Value 1" );
```

The `set()` method adds or replaces a single object in the cache, given a key and value.  The key is assumed to be a string, but the value can be anything.  Anytime an object is added or replaced, it becomes the most recently used.

Note that the `maxBytes` governor only works with values that have a `length` property (namely Strings and Buffers).  Anything else is assumed to have a length of 0, and will not affect the total byte count.

Adding new keys may cause the least recently used object(s) to be expired from the cache.

## get

```js
var value = cache.get( 'key1' );
```

The `get()` method fetches a value given a key.  If the key is not found in the cache the return value will be `undefined`.  Note that when fetching any key, that object becomes the most recently used.

Fetching keys will never cause any object to be expired from the cache.

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

## on

```js
cache.on( 'expire', function(key, reason) {
	console.log(`Cache expired ${key} because of ${reason}.`);
});
```

The pixl-cache class inherits from Node's [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter), so it has all those methods available including [on()](https://nodejs.org/api/events.html#events_emitter_on_eventname_listener) and [off()](https://nodejs.org/api/events.html#events_emitter_off_eventname_listener).

## Events

The following events are emitted:

### expire

The `expire` event is emitted when the cache is about to expire the least recently used object, either due to total key count or byte count.  The event listener will be passed two arguments, the key being expired, and a reason:

```js
cache.on( 'expire', function(key, reason) {
	console.log(`Cache expired ${key} because of ${reason}.`);
});
```

The reason will be either `count` (expired due to key count), or `bytes` (expired due to total byte count).

## Properties

The following properties are available on pixl-cache class instances.

### items

The `items` property is a hash containing all the objects currently in the cache, keyed by their keys.  Please do not directly manipulate this object, as it will become out of sync with the linked list system.  However, you are free to read from it.

### count

The `count` property contains the current total key count in the cache.

### bytes

The `bytes` property contains the current total byte count in the cache.

Note that if you use strings for values, the string `length` is calculated as the byte count.  This is not technically correct, due to how strings are internally represented in JavaScript as 16-bit.  If you want to use string values but set an exact maximum in bytes you may want to halve the `maxBytes` value.

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
