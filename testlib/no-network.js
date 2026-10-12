'use strict';
// testlib/no-network.js — preload that makes any network attempt throw. Proves the suite runs
// offline:  NODE_OPTIONS="--require ./testlib/no-network.js" node --test
// (NODE_OPTIONS reaches the per-file test subprocesses; a plain --require would not.)
const net = require('node:net');
const tls = require('node:tls');
const boom = () => { throw new Error('NETWORK BLOCKED: a test tried to reach the network'); };
globalThis.fetch = async () => boom();
net.Socket.prototype.connect = boom;
net.connect = boom;
net.createConnection = boom;
tls.connect = boom;
