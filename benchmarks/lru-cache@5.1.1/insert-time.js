var time = process.hrtime;
var uuid = require('uuid');

var LRU = require('lru-cache');
var cache = new LRU({
    max: 1e5,
    length: function() { return 1; }
});

console.log('%s	%s	%s	%s', 'Iterations', 'Average (ms)', 'Total (ms)', 'Memory Usage (bytes)');
var start, prev; start = prev = time();
var memory = process.memoryUsage().rss;
for (var i = 1; i <= 1e6; i++) {

    cache.set(i, { key: i, value: uuid.v4() });

    if (i % 1e4 === 0) {
    	memory = Math.max( memory, process.memoryUsage().rss );
        console.log('%d	%d	%d	%d', i, ms(time(prev)) / 1e4, ms(time(start)), memory);
        prev = time();
    }
}

function ms(tuple) {
    return tuple[0] * 1e3 + tuple[1] / 1e6;
}
