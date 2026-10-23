// Unit tests for pixl-cache

var Cache = require('./cache.js');

exports.tests = [

	function basic(test) {
		var cache = new Cache();
		cache.set( 'key1', 'value1' );
		var value = cache.get('key1');
		
		test.ok( value === "value1", "Value for key1 is not correct: " + value );
		test.ok( cache.count == 1, "Cache has incorrect number of keys: " + cache.count );
		test.ok( cache.bytes == 20, "Cache has incorrect number of bytes: " + cache.bytes );
		
		cache.set( 'key1', 'value12345' );
		value = cache.get('key1');
		
		test.ok( value === "value12345", "Value for key1 is not correct after replace: " + value );
		test.ok( cache.count == 1, "Cache has incorrect number of keys after replace: " + cache.count );
		test.ok( cache.bytes == 28, "Cache has incorrect number of bytes after replace: " + cache.bytes );
		
		cache.delete( 'key1' );
		value = cache.get('key1');
		
		test.ok( !value, "Value for key1 is not correct after delete: " + value );
		test.ok( cache.count == 0, "Cache has incorrect number of keys after delete: " + cache.count );
		test.ok( cache.bytes == 0, "Cache has incorrect number of bytes after delete: " + cache.bytes );
		
		cache.set( 'key1', 'value12345' );
		cache.clear();
		value = cache.get('key1');
		
		test.ok( !value, "Value for key1 is not correct after clear: " + value );
		test.ok( cache.count == 0, "Cache has incorrect number of keys after clear: " + cache.count );
		test.ok( cache.bytes == 0, "Cache has incorrect number of bytes after clear: " + cache.bytes );
		
		test.done();
	},
	
	function advanced(test) {
		// try non-string values
		var value;
		var cache = new Cache();
		
		cache.set( 'key1', 12345 );
		value = cache.get('key1');
		test.ok( value === 12345, "Number value is incorrect: " + value );
		
		cache.set( 'key1z', 0 );
		value = cache.get('key1z');
		test.ok( value === 0, "Number value is incorrect: " + value );
		
		cache.set( 'key2', true );
		value = cache.get('key2');
		test.ok( value === true, "Boolean value is incorrect: " + value );
		
		cache.set( 'key2f', false );
		value = cache.get('key2f');
		test.ok( value === false, "Boolean value is incorrect: " + value );
		
		cache.set( 'key3', Buffer.alloc(10) );
		value = cache.get('key3');
		test.ok( !!value.fill, "Value is not a buffer: " + value );
		test.ok( value.length == 10, "Buffer length is incorrect: " + value.length );
		
		// must pass length metadata for null value
		cache.set( 'key4', null, { length: 1 } );
		value = cache.get('key4');
		test.ok( value === null, "Null value is incorrect: " + value );
		
		// must pass length metadata for undefined value
		cache.set( 'key4u', undefined, { length: 1 } );
		value = cache.get('key4u');
		test.ok( value === undefined, "Undefined value is incorrect: " + value );
		
		cache.set( 'key5', function() {} );
		value = cache.get('key5');
		test.ok( typeof(value) == 'function', "Function value is incorrect: " + value );
		
		cache.set( 'key6', { foo: 'bar' } );
		value = cache.get('key6');
		test.ok( typeof(value) == 'object', "Object value is incorrect: " + value );
		
		test.done();
	},
	
	function copyBuffersDisabled(test) {
		// Both the default and explicit opt-out must preserve reference semantics.
		[ undefined, { copyBuffers: false } ].forEach( function(opts) {
			var cache = new Cache(opts);
			var source = Buffer.from([ 1, 2, 3 ]);
			cache.set( 'key', source );
			
			test.ok( cache.copyBuffers === false, "Buffer copying should be disabled" );
			test.ok( cache.get('key') === source, "Disabled copying should retain the original Buffer" );
			
			source[0] = 99;
			test.ok( cache.get('key')[0] === 99, "Source mutations should remain visible when copying is disabled" );
		});
		
		test.done();
	},
	
	function copyBuffersIsolation(test) {
		// Exercise ordinary Buffer inputs, including bytes outside the ASCII range.
		var cache = new Cache({ copyBuffers: true });
		var source = Buffer.from([ 0, 1, 127, 128, 255 ]);
		cache.set( 'first', source, { date: 12345 } );
		cache.set( 'second', source );
		var first = cache.get('first');
		var second = cache.get('second');
		
		test.ok( Buffer.isBuffer(first), "Copied value should still be a Buffer" );
		test.ok( first !== source && first.equals(source), "Copy should preserve every byte in a new Buffer" );
		test.ok( second !== first, "Each set should create an independent copy" );
		test.ok( cache.getMeta('first').date === 12345, "Copying should preserve custom metadata" );
		
		// Input mutation must not corrupt either cached value.
		source.fill(42);
		test.ok( first.equals(Buffer.from([ 0, 1, 127, 128, 255 ])), "Source mutation changed the cached bytes" );
		test.ok( second.equals(first), "Source mutation changed the second cached copy" );
		
		// Copying happens on set only. Reads still expose the stored, mutable Buffer.
		test.ok( cache.get('first') === first && cache.getMeta('first').value === first, "Reads should return the stored copy" );
		first[0] = 99;
		test.ok( cache.get('first')[0] === 99, "Reads should not make additional copies" );
		test.ok( source[0] === 42 && second[0] === 0, "Cached mutation leaked into another Buffer" );
		
		test.done();
	},
	
	function copyBuffersSlice(test) {
		// A small, offset view must copy only its selected bytes. Keep different
		// sentinel bytes outside the view to catch copying the wrong region.
		var cache = new Cache({ copyBuffers: true });
		var backing = Buffer.alloc(65536, 0xAA);
		var source = backing.subarray(123, 140);
		source.fill(0xBB);
		cache.set( 'slice', source );
		var value = cache.get('slice');
		
		test.ok( value.equals(Buffer.alloc(17, 0xBB)), "Copy should include only the selected slice" );
		test.ok( cache.bytes === 27, "Byte accounting should include only the key and slice payload" );
		
		backing.fill(0);
		test.ok( value.equals(Buffer.alloc(17, 0xBB)), "Backing allocation mutation changed the cached slice" );
		
		test.done();
	},
	
	function copyBuffersSizes(test) {
		// Include empty negative-cache stubs, typical JSON sizes, and large Buffers.
		// Check content and public cache accounting without inspecting allocations.
		[ 0, 5120, 131072 ].forEach( function(size) {
			var cache = new Cache({ copyBuffers: true });
			var source = Buffer.alloc(size, 0xA5);
			cache.set( 'key', source );
			var value = cache.get('key');
			
			test.ok( Buffer.isBuffer(value) && value !== source, "Expected a new Buffer for size " + size );
			test.ok( value.equals(source), "Copied bytes differ for size " + size );
			test.ok( cache.count === 1 && cache.bytes === size + 6, "Incorrect accounting for size " + size );
			
			if (size) {
				// Verify isolation by modifying the source, without relying on how
				// Node allocates the underlying storage for either Buffer.
				source.fill(0);
				test.ok( value.equals(Buffer.alloc(size, 0xA5)), "Source mutation changed the cached value for size " + size );
			}
		});
		
		test.done();
	},
	
	function copyBuffersReplace(test) {
		// Replacing an existing key must copy again and adjust payload accounting.
		var cache = new Cache({ copyBuffers: true });
		cache.set( 'key', Buffer.from('old'), { date: 12345 } );
		var previous = cache.get('key');
		var source = Buffer.from('new value');
		cache.set( 'key', source );
		var item = cache.getMeta('key');
		
		test.ok( item.value !== source && item.value !== previous, "Replacement should store a fresh copy" );
		test.ok( item.value.equals(source), "Replacement bytes are incorrect" );
		test.ok( previous.toString() === 'old', "Replacement modified the previous cached Buffer" );
		test.ok( item.date === 12345, "Replacement should preserve existing metadata" );
		test.ok( cache.count === 1 && cache.bytes === 15, "Replacement payload accounting is incorrect" );
		
		source.fill(0);
		test.ok( item.value.toString() === 'new value', "Source mutation changed the replacement" );
		
		// Explicit length metadata still overrides payload accounting when copying.
		cache.set( 'key', Buffer.from('custom'), { length: 100, date: 54321 } );
		test.ok( cache.bytes === 106 && cache.getMeta('key').date === 54321, "Custom metadata was not applied to the copied value" );
		cache.delete('key');
		test.ok( cache.count === 0 && cache.bytes === 0, "Deleting a copied value did not clear its accounting" );
		
		test.done();
	},
	
	function copyBuffersEviction(test) {
		// Two 4-byte payloads plus their single-character keys fit exactly.
		// Reading A should promote it, so adding C must evict B with its copied value.
		var cache = new Cache({ copyBuffers: true, maxBytes: 12 });
		var source = Buffer.from('BBBB');
		var expired = [];
		cache.on('expire', function(item, reason) {
			expired.push({ item: item, reason: reason });
		});
		cache.set( 'A', Buffer.from('AAAA') );
		cache.set( 'B', source );
		cache.get('A');
		cache.set( 'C', Buffer.from('CCCC') );
		
		test.ok( expired.length === 1, "Expected exactly one byte-limit eviction" );
		if (expired.length) {
			test.ok( expired[0].item.key === 'B' && expired[0].reason === 'bytes', "Incorrect LRU eviction" );
			test.ok( expired[0].item.value !== source && expired[0].item.value.equals(source), "Expire event should expose the copied value" );
		}
		test.ok( !cache.has('B') && cache.has('A') && cache.has('C'), "Incorrect keys survived eviction" );
		test.ok( cache.count === 2 && cache.bytes === 12, "Byte-limit accounting is incorrect after eviction" );
		
		cache.clear();
		test.ok( cache.count === 0 && cache.bytes === 0, "Clear should reset copied-value accounting" );
		cache.set( 'B', source );
		test.ok( cache.get('B') !== source, "Clear should preserve the copyBuffers option" );
		
		test.done();
	},
	
	function copyBuffersOtherValues(test) {
		// This is a Buffer-only feature, not a general clone or deep-copy option.
		var cache = new Cache({ copyBuffers: true });
		var nested = Buffer.from('nested');
		var values = [ 'text', 123, true, false, { data: nested }, [ 1, 2 ], new Uint8Array([ 3, 4 ]), null, undefined ];
		values.forEach( function(value, idx) {
			// Null and undefined require explicit nonzero length metadata in this API.
			var meta = (value == null) ? { length: 1 } : undefined;
			cache.set( 'key' + idx, value, meta );
			test.ok( cache.get('key' + idx) === value, "Non-Buffer value or reference changed at index " + idx );
		});
		test.ok( cache.get('key4').data === nested, "Nested Buffers should not be copied" );
		
		test.done();
	},
	
	function sizes(test) {
		// test javascript native size calculation
		var cache = new Cache();
		
		// test key = 2 bytes
		
		// number (8 bytes)
		cache.set( 'A', 1 );
		test.ok( cache.bytes == 10, "Cache has incorrect bytes for num: " + cache.bytes );
		cache.clear();
		
		// boolean (4 bytes)
		cache.set( 'A', true );
		test.ok( cache.bytes == 6, "Cache has incorrect bytes for bool: " + cache.bytes );
		cache.clear();
		
		// string (2 bytes per char)
		cache.set( 'A', "1" );
		test.ok( cache.bytes == 4, "Cache has incorrect bytes for string: " + cache.bytes );
		cache.clear();
		
		// buffer
		cache.set( 'A', Buffer.alloc(100) );
		test.ok( cache.bytes == 102, "Cache has incorrect bytes for buffer: " + cache.bytes );
		cache.clear();
		
		// object (0 bytes unless specified)
		cache.set( 'A', { "not": "counted" } );
		test.ok( cache.bytes == 2, "Cache has incorrect bytes for object: " + cache.bytes );
		cache.clear();
		
		test.done();
	},
	
	function metadata(test) {
		// store object with metadata
		var item;
		var cache = new Cache();
		
		cache.set( 'key1', 'value1', { joe: 12345 } );
		item = cache.getMeta('key1');
		test.ok( !!item, "Failed to fetch meta for key1" );
		test.ok( item.key === "key1", "Incorrect key for meta fetch: " + item.key );
		test.ok( item.joe === 12345, "Missing metadata in object" );
		
		// update without metadata, should preserve
		cache.set( 'key1', 'value1' );
		item = cache.getMeta('key1');
		test.ok( !!item, "Failed to fetch meta for key1" );
		test.ok( item.key === "key1", "Incorrect key for meta fetch: " + item.key );
		test.ok( item.joe === 12345, "Missing metadata in object" );
		
		// update metadata
		cache.set( 'key1', 'value2', { joe: 12346 } );
		item = cache.getMeta('key1');
		test.ok( !!item, "Failed to fetch meta for key1 after update" );
		test.ok( item.key === "key1", "Incorrect key for meta fetch after update: " + item.key );
		test.ok( item.joe === 12346, "Missing metadata in object after update" );
		
		test.ok( cache.bytes == 20, "Incorrect total bytes: " + cache.bytes );
		
		// add key with custom length in metadata
		cache.set( 'key2', 'value3', { length: 1000 } );
		
		test.ok( cache.bytes == 1028, "Incorrect total bytes after custom metadata length: " + cache.bytes );
		
		test.done();
	},
	
	function fillItems(test) {
		var idx, key, value, item;
		var cache = new Cache({ maxItems: 10 });
		cache.on('expire', function(item, reason) {
			test.ok( false, "Expire event fired unexpectedly: " + item.key + " for " + reason );
		});
		
		for (idx = 1; idx <= 10; idx++) {
			cache.set( 'key' + idx, 'value' + idx );
		}
		
		for (idx = 1; idx <= 10; idx++) {
			value = cache.get( 'key' + idx );
			test.ok( value === 'value' + idx, "Cache key" + idx + " has incorrect value: " + value );
		}
		
		test.ok( cache.count == 10, "Cache has incorrect count: " + cache.count );
		
		// walk the linked list forwards (internal API)
		item = cache.first;
		for (idx = 10; idx >= 1; idx--) {
			key = 'key' + idx;
			value = 'value' + idx;
			test.ok( !!item, "Item is falsey at idx " + idx );
			test.ok( item.key === key, "Item key is incorrect: " + item.key + " != " + key );
			test.ok( item.value === value, "Item value is incorrect: " + item.value + " != " + value );
			item = item.next;
		}
		test.ok( !item, "Item is not false at end of list" );
		
		// walk the linked list backwards (internal API)
		item = cache.last;
		for (idx = 1; idx <= 10; idx++) {
			key = 'key' + idx;
			value = 'value' + idx;
			test.ok( !!item, "Item is falsey at idx " + idx );
			test.ok( item.key === key, "Item key is incorrect: " + item.key + " != " + key );
			test.ok( item.value === value, "Item value is incorrect: " + item.value + " != " + value );
			item = item.prev;
		}
		test.ok( !item, "Item is not false at start of list" );
		
		test.done();
	},
	
	function overflowItems(test) {
		var idx, key, value, item;
		var cache = new Cache({ maxItems: 10 });
		
		test.expect( 13 );
		
		cache.on('expire', function(item, reason) {
			test.ok( item.key == "key1", "Expired key is incorrect: " + item.key );
			test.ok( reason == "count", "Expired reason is incorrect: " + reason );
		});
		
		for (idx = 1; idx <= 11; idx++) {
			cache.set( 'key' + idx, 'value' + idx );
		}
		
		for (idx = 2; idx <= 11; idx++) {
			value = cache.get( 'key' + idx );
			test.ok( value === 'value' + idx, "Cache key key" + idx + " has incorrect value: " + value );
		}
		
		value = cache.get( 'key1' );
		test.ok( !value, "Expected null, got actual value for key1: " + value );
		test.done();
	},
	
	function fillBytes(test) {
		var idx, key, value, item;
		var cache = new Cache({ maxBytes: 282 });
		cache.on('expire', function(item, reason) {
			test.ok( false, "Expire event fired unexpectedly: " + item.key + " for " + reason );
		});
		
		for (idx = 1; idx <= 10; idx++) {
			cache.set( 'key' + idx, 'ABCDEFGHIJ' );
		}
		
		for (idx = 1; idx <= 10; idx++) {
			value = cache.get( 'key' + idx );
			test.ok( value === 'ABCDEFGHIJ', "Cache key" + idx + " has incorrect value: " + value );
		}
		
		test.ok( cache.count == 10, "Cache has incorrect count: " + cache.count );
		test.ok( cache.bytes == 282, "Cache has incorrect bytes: " + cache.bytes );
		test.done();
	},
	
	function overflowBytes(test) {
		var idx, key, value, item;
		var cache = new Cache({ maxBytes: 300 });
		
		test.expect( 13 );
		
		cache.on('expire', function(item, reason) {
			test.ok( item.key == "key11", "Expired key is incorrect: " + item.key );
			test.ok( reason == "bytes", "Expired reason is incorrect: " + reason );
		});
		
		for (idx = 11; idx <= 21; idx++) {
			cache.set( 'key' + idx, 'ABCDEFGHIJ' );
		}
		
		for (idx = 12; idx <= 21; idx++) {
			value = cache.get( 'key' + idx );
			test.ok( value === 'ABCDEFGHIJ', "Cache key key" + idx + " has incorrect value: " + value );
		}
		
		value = cache.get( 'key11' );
		test.ok( !value, "Expected null, got actual value for key11: " + value );
		test.done();
	},
	
	function overflowBytesMultiple(test) {
		var idx, key, value, item;
		var cache = new Cache({ maxBytes: 300 });
		
		for (idx = 11; idx <= 20; idx++) {
			cache.set( 'key' + idx, 'ABCDEFGHIJ' );
		}
		for (idx = 11; idx <= 20; idx++) {
			value = cache.get( 'key' + idx );
			test.ok( value === 'ABCDEFGHIJ', "Cache key key" + idx + " has incorrect value: " + value );
		}
		
		// cause everything to be expunged at once and replaced with boom
		// (292 byte buf + `boom` key == 300 bytes exactly)
		var buf = Buffer.alloc(292);
		cache.set( 'boom', buf );
		
		value = cache.get('boom');
		test.ok( !!value, "Unable to fetch boom");
		test.ok( value.length == 292, "Boom has incorrect length: " + value.length );
		
		test.ok( cache.count == 1, "Cache has incorrect count after boom: " + cache.count );
		test.ok( cache.bytes == 300, "Cache has incorrect bytes after boom: " + cache.bytes );
		
		// internal API checks
		test.ok( cache.first.key === "boom", "First list item is not boom: " + cache.first.key );
		test.ok( cache.last.key === "boom", "First last item is not boom: " + cache.last.key );
		
		// now cause an implosion (cannot store > 300 bytes, will immediately be expunged)
		// (287 byte buf + `implode` key == 301 bytes exactly)
		var buf2 = Buffer.alloc(287);
		cache.set( 'implode', buf2 );
		
		value = cache.get('implode');
		test.ok( !value, "Oops, implode should not be fetchable!  But it was!");
		
		test.ok( cache.count == 0, "Cache has incorrect count after implosion: " + cache.count );
		test.ok( cache.bytes == 0, "Cache has incorrect bytes after implosion: " + cache.bytes );
		
		test.done();
	},
	
	function promote(test) {
		var idx, key, value, item;
		var cache = new Cache();
		
		for (idx = 1; idx <= 10; idx++) {
			cache.set( 'key' + idx, 'value' + idx );
		}
		
		// head list item should be last key inserted (internal API)
		test.ok( cache.first.key === "key10", "First item in list has incorrect key: " + cache.first.key );
		test.ok( cache.first.next.key === "key9", "Second item in list has incorrect key: " + cache.first.next.key );
		
		// promoting head key should have no effect
		cache.get( "key10" );
		
		test.ok( cache.first.key === "key10", "First item in list has incorrect key: " + cache.first.key );
		test.ok( cache.first.next.key === "key9", "Second item in list has incorrect key: " + cache.first.next.key );
		
		// promote key5 to head
		cache.get( "key5" );
		
		test.ok( cache.first.key === "key5", "First item in list has incorrect key after promotion: " + cache.first.key );
		test.ok( cache.first.next.key === "key10", "Second item in list has incorrect key after promotion: " + cache.first.next.key );
		test.ok( cache.first.next.next.key === "key9", "Third item in list has incorrect key after promotion: " + cache.first.next.next.key );
		test.ok( cache.first.next.prev.key === "key5", "Reverse linking is incorrect for promoted head key5" );
		
		// make sure end of list is expected
		test.ok( cache.last.key === "key1", "Last item in list is unexpected: " + cache.last.key );
		
		// promote last key to head
		cache.get( "key1" );
		
		test.ok( cache.first.key === "key1", "First item in list has incorrect key after promotion: " + cache.first.key );
		test.ok( cache.first.next.key === "key5", "Second item in list has incorrect key after promotion: " + cache.first.next.key );
		test.ok( cache.first.next.next.key === "key10", "Third item in list has incorrect key after promotion: " + cache.first.next.next.key );
		test.ok( cache.first.next.prev.key === "key1", "Reverse linking is incorrect for promoted head key5" );
		
		// make sure end of list is expected
		test.ok( cache.last.key === "key2", "Last item in list is unexpected: " + cache.last.key );
		
		test.done();
	},
	
	function keepAlive(test) {
		var idx, idy, key, value, item;
		var cache = new Cache({ maxItems: 10 });
		
		cache.on('expire', function(item, reason) {
			if (!item.key.match(/^random_/)) test.ok( false, "Expired key is incorrect: " + item.key );
			if (reason != "count") test.ok( false, "Expired reason is incorrect: " + reason );
		});
		
		cache.set( 'special', "SPECIAL" );
		
		// flood cache with totally random keys, but make sure to fetch special key between batches
		for (idx = 0; idx < 100; idx++) {
			for (var idy = 0; idy < 9; idy++) {
				cache.set( 'random_' + idx + '_' + idy + '_' + Math.random(), 'RANDOM' + Math.random() );
			}
			cache.get( 'special' );
		}
		
		value = cache.get( 'special' );
		test.ok( value === "SPECIAL", "Special key has disappeared unexpectedly: " + value );
		
		// flood cache with semi-random keys (will replace each other)
		for (idx = 0; idx < 100; idx++) {
			for (var idy = 0; idy < 9; idy++) {
				cache.set( 'random_' + Math.floor(Math.random() * 9), 'RANDOM' + Math.random() );
			}
			cache.get( 'special' );
		}
		
		value = cache.get( 'special' );
		test.ok( value === "SPECIAL", "Special key has disappeared unexpectedly: " + value );
		
		// remove expire listener
		cache.removeAllListeners( 'expire' );
		
		// flood cache with too many keys per match, should expunge special key
		for (idx = 0; idx < 100; idx++) {
			for (var idy = 0; idy < 10; idy++) {
				cache.set( 'random_' + idx + '_' + idy + '_' + Math.random(), 'RANDOM' + Math.random() );
			}
			cache.get( 'special' );
		}
		
		value = cache.get( 'special' );
		test.ok( !value, "Special key shuld be expunged, but is still here: " + value );
		
		test.done();
	},
	
	function age(test) {
		var idx, key, value, item, expires;
		var cache = new Cache({ maxAge: 1 });
		cache.set( 'aged', "AGED" );
		
		value = cache.get( 'aged' );
		test.ok( value === "AGED", "Aged key has disappeared unexpectedly: " + value );
		
		item = cache.getMeta( 'aged' );
		test.ok( !!item, "Aged key has disappeared unexpectedly: " + value );
		test.ok( item.expires > Date.now()/1000, "Aged key has unexpected expiration: " + expires );
		
		expires = item.expires;
		value = null;
		
		// make sure expires event fires for age ejection
		var saw_expire_event = false;
		cache.on('expire', function(item, reason) {
			saw_expire_event = true;
			test.ok( item.key === 'aged', "Unexpected key in expire event: " + item.key );
			test.ok( reason === 'age', "Unexpected reason for expire event: " + reason );
		});
		
		// fetch every 100ms until item expires
		var timer = setInterval( function() {
			value = cache.get( 'aged' );
			if (item.expires <= Date.now()/1000) {
				// TTL expired, item should be gone now
				clearTimeout( timer );
				test.ok( value === undefined, "Aged value expected to be undefined by now: " + value );
				test.ok( saw_expire_event === true, "Did not see expire event after full second" );
				test.done();
			}
			else {
				// TTL still fresh
				test.ok( value === "AGED", "Aged key has disappeared unexpectedly: " + value );
			}
		}, 100 );
	}
	
];
