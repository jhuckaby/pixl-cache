// Simple LRU Cache for Node.js
// Uses a combination of a hash map and a double-linked list.
// To use maxBytes, your values are expected to have a `length` property.
// Copyright (c) 2019 - 2025 Joseph Huckaby. MIT License.

var EventEmitter = require("events").EventEmitter;

class Cache extends EventEmitter {
	
	constructor(opts) {
		// class constructor
		// opts: { maxItems, maxBytes, maxAge }
		super();
		
		// defaults
		this.maxItems = 0;
		this.maxBytes = 0;
		this.maxAge = 0;
		
		// user overrides
		if (opts) {
			for (var key in opts) this[key] = opts[key];
		}
		
		this.clear();
	}
	
	clear() {
		// empty the cache
		this.items = new Map();
		this.first = null;
		this.last = null;
		
		// stats
		this.count = 0;
		this.bytes = 0;
	}
	
	set(key, value, meta) {
		// set new key or replace existing
		// either way, move item to head of list
		// run maintenance after
		var item = this.items.get(key);
		if (!meta) meta = {};
		
		if (!("length" in meta)) {
			switch (typeof(value)) {
				case 'number': meta.length = 8; break; // numbers are 64-bit
				case 'boolean': meta.length = 4; break; // bools are 32-bit
				case 'string': meta.length = value.length * 2; break; // strings are 16-bit per char
			}
		}
		
		if (item) {
			// replace existing
			this.bytes -= item.length || item.value.length || 0;
			item.value = value;
			this.bytes += meta.length || value.length || 0;
		}
		else {
			// add new
			item = {
				key: key, 
				value: value, 
				prev: null, 
				next: null 
			};
			this.items.set(key, item);
			this.bytes += (key.length * 2) + (meta.length || value.length || 0);
			this.count++;
		}
		
		// set expiration if maxAge is set
		if (this.maxAge) item.expires = (Date.now() / 1000) + this.maxAge;
		
		// import optional metadata
		for (var mkey in meta) item[mkey] = meta[mkey];
		
		// promote to front of list
		this.promote(item);
		
		// maintenance
		if (this.maxItems && (this.count > this.maxItems)) {
			this.emit( 'expire', this.last, 'count' );
			this.delete( this.last.key );
		}
		if (this.maxBytes) {
			while (this.bytes > this.maxBytes) {
				this.emit( 'expire', this.last, 'bytes' );
				this.delete( this.last.key );
			}
		}
	}
	
	get(key) {
		// fetch key and return value
		// move object to head of list
		var item = this.items.get(key);
		if (!item) return undefined;
		if (item.expires && (Date.now() / 1000 >= item.expires)) {
			this.emit( 'expire', item, 'age' );
			this.delete( key );
			return undefined;
		}
		this.promote(item);
		return item.value;
	}
	
	getMeta(key) {
		// fetch key and return internal cache wrapper object
		// will contain any metadata user added when key was set
		// (this still moves object to front of list)
		var item = this.items.get(key);
		if (!item) return undefined;
		if (item.expires && (Date.now() / 1000 >= item.expires)) {
			this.emit( 'expire', item, 'age' );
			this.delete( key );
			return undefined;
		}
		this.promote(item);
		return item;
	}
	
	delete(key) {
		// remove key from cache
		var item = this.items.get(key);
		if (!item) return false;
		
		this.bytes -= (key.length * 2) + (item.length || item.value.length || 0);
		this.count--;
		this.items.delete(key);
		
		// adjust linked list
		if (item.prev) item.prev.next = item.next;
		if (item.next) item.next.prev = item.prev;
		if (item === this.first) this.first = item.next;
		if (item === this.last) this.last = item.prev;
		
		return true;
	}
	
	has(key) {
		// return true if key is present in cache
		// (do not change order)
		var item = this.items.get(key);
		if (!item) return false;
		if (item.expires && (Date.now() / 1000 >= item.expires)) {
			return false;
		}
		return true;
	}
	
	promote(item) {
		// promote item to head of list
		// (accepts new item or existing item)
		if (item !== this.first) {
			if (item.prev) item.prev.next = item.next;
			if (item.next) item.next.prev = item.prev;
			if (item === this.last) this.last = item.prev;
			
			// install as new head
			item.prev = null;
			item.next = this.first;
			if (this.first) this.first.prev = item;
			this.first = item;
			if (!this.last) this.last = item;
		}
	}
	
	getStats() {
		// return general stats for cache
		var stats = {
			count: this.count,
			bytes: this.bytes
		};
		
		// guess rough percentage of cache fullness
		var pct_count = this.maxItems ? ((this.count / this.maxItems) * 100) : 0;
		var pct_bytes = this.maxBytes ? ((this.bytes / this.maxBytes) * 100) : 0;
		stats.full = '' + Math.floor( Math.max(pct_count, pct_bytes) ) + '%';
		
		// include 10 hottest keys
		stats.hotKeys = [];
		var item = this.first;
		while (item && (stats.hotKeys.length < 10)) {
			stats.hotKeys.push( item.key );
			item = item.next;
		}
		
		return stats;
	}
	
}

module.exports = Cache;
