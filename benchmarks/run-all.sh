#!/bin/bash

# Thanks to stale-lru-cache for these benchmark scripts!
# Borrowed from: https://github.com/cyberthom/stale-lru-cache/tree/master/benchmark

SCRIPT_DIR=$(cd $(dirname $0) && pwd)
RESULTS_DIR=$SCRIPT_DIR/results

rm -rf $RESULTS_DIR
mkdir -p $RESULTS_DIR

for LIB_DIR in $SCRIPT_DIR/*@*; do
    LIB_NAME=$(basename $LIB_DIR)
    echo "$LIB_NAME"
    cd $LIB_DIR
    npm install
    sleep 1
    node "$LIB_DIR/read-time.js" | tee "$RESULTS_DIR/$LIB_NAME--read-time.tsv"
    sleep 1
    node "$LIB_DIR/insert-time.js" | tee "$RESULTS_DIR/$LIB_NAME--insert-time.tsv"
done

echo "Insert Time"
node -e "console.log('%s\t%s\t%s\t%s', 'Iterations', 'Average (ms)', 'Total (ms)', 'Memory Usage (bytes)');"
for LIB_DIR in $SCRIPT_DIR/*@*; do
    LIB_NAME=$(basename $LIB_DIR)
    echo "$LIB_NAME"
    tail -n1 $RESULTS_DIR/$LIB_NAME--insert-time.tsv
done

echo "Read Time"
node -e "console.log('%s\t%s\t%s', 'Iterations', 'Average (ms)', 'Total (ms)');"
for LIB_DIR in $SCRIPT_DIR/*@*; do
    LIB_NAME=$(basename $LIB_DIR)
    echo "$LIB_NAME"
    tail -n1 $RESULTS_DIR/$LIB_NAME--read-time.tsv
done
