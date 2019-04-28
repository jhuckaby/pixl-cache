// Simple LRU Cache for Node.js
// Uses a combination of a hash and a double-linked list.
// To use maxBytes, your values are expected to have a `length` property.
// Copyright (c) 2019 Joseph Huckaby. MIT License.

var EventEmitter = require("events").EventEmitter;

class Cache extends EventEmitter {
	
	constructor(opts) {
		// class constructor
		// opts: { maxItems, maxBytes }
		super();
		this.maxItems = 0;
		this.maxBytes = 0;
		if (opts) {
			for (var key in opts) this[key] = opts[key];
		}
		this.clear();
	}
	
	clear() {
		// empty the cache
		this.items = {};
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
		var item = this.items[key];
		if (!meta) meta = {};
		
		if (item) {
			// replace existing
			this.bytes -= item.length || item.value.length || 0;
			item.value = value;
			this.bytes += meta.length || value.length || 0;
		}
		else {
			// add new
			item = this.items[key] = {
				key: key, 
				value: value, 
				prev: null, 
				next: null 
			};
			this.bytes += meta.length || value.length || 0;
			this.count++;
		}
		
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
		var item = this.items[key];
		if (!item) return undefined;
		this.promote(item);
		return item.value;
	}
	
	getMeta(key) {
		// fetch key and return internal cache wrapper object
		// will contain any metadata user added when key was set
		// (this still moves object to front of list)
		var item = this.items[key];
		if (!item) return undefined;
		this.promote(item);
		return item;
	}
	
	delete(key) {
		// remove key from cache
		var item = this.items[key];
		if (!item) return false;
		
		this.bytes -= item.value.length || 0;
		this.count--;
		delete this.items[key];
		
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
		return( key in this.items );
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
