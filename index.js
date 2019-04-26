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
	
	set(key, value) {
		// set new key or replace existing
		// either way, move item to head of list
		// run maintenance after
		if (this.has(key)) {
			// replace existing
			var item = this.items[key];
			this.bytes -= item.value.length || 0;
			item.value = value;
			this.bytes += value.length || 0;
			this.promote(item);
		}
		else {
			// add new
			var item = this.items[key] = {
				key: key, 
				value: value, 
				prev: null, 
				next: null 
			};
			this.bytes += value.length || 0;
			this.count++;
			this.promote(item);
		}
		
		// maintenance
		if (this.maxItems && (this.count > this.maxItems)) {
			this.emit( 'expire', this.last.key, 'count' );
			this.delete( this.last.key );
		}
		if (this.maxBytes) {
			while (this.bytes > this.maxBytes) {
				this.emit( 'expire', this.last.key, 'bytes' );
				this.delete( this.last.key );
			}
		}
	}
	
	get(key) {
		// fetch key and return value
		// move object to head of list
		if (!this.has(key)) return undefined;
		
		var item = this.items[key];
		this.promote(item);
		return item.value;
	}
	
	delete(key) {
		// remove key from cache
		if (!this.has(key)) return false;
		
		var item = this.items[key];
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
	
}

module.exports = Cache;
