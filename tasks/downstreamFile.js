function createDownstreamFileTask(execlib){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    SinkTask = execSuite.SinkTask,
    taskRegistry = execSuite.taskRegistry;

  function DownstreamFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.localfilename = prophash.localfilename || prophash.filename;
    this.parsermodulename = prophash.parsermodulename;
    this.startfrom = prophash.firstrecordindex || 0;
    this.quantity = prophash.recordcount;
    this.cb = prophash.cb;
    this.going = false;
    this.writeDefer = q.defer();
    this.report = {};
    this.writeDefer.promise.done(
      this.writerSucceeded.bind(this),
      this.writerFailed.bind(this),
      function(record){
        console.log(record,'written');
      }
    );
  }
  lib.inherit(DownstreamFileTask, SinkTask);
  DownstreamFileTask.prototype.__cleanUp = function () {
    this.report = null;
    this.writeDefer = null;
    this.going = null;
    this.cb = null;
    this.quantity = null;
    this.startfrom = null;
    this.parsermodulename = null;
    this.localfilename = null;
    this.filename = null;
    this.ipaddress = null;
    this.sink = null;
    SinkTask.prototype.__cleanUp.call(this);
  };
  DownstreamFileTask.prototype.writerSucceeded = function (byteswritten) {
    this.report.size = byteswritten;
    if (this.cb){
      this.cb(this.report);
    }
    this.destroy();
  };
  DownstreamFileTask.prototype.writerFailed = function (reason) {
    this.report.exception = reason;
    if (this.cb) {
      this.cb(this.report);
    }
    this.destroy();
  };
  DownstreamFileTask.prototype.go = function () {
    if(this.going === true || this.going === null){
      return;
    }
    this.going = true;
    taskRegistry.run('transmitTcp', {
      sink: this.sink,
      ipaddress: this.ipaddress,
      options: {
        filename: this.filename,
        modulename: this.parsermodulename,
        startfrom: this.startfrom,
        quantity: this.quantity,
        download: true
      },
      onPayloadNeeded: this.onPayloadNeeded.bind(this),
      onIncomingPacket: this.onIncomingPacket.bind(this),
      onOver: this.onTransmitOver.bind(this)
    });
  };
  DownstreamFileTask.prototype.onIncomingPacket = function (packet) {
    this.cb(packet);
  };
  DownstreamFileTask.prototype.onTransmitOver = function () {
    this.cb(null);
  };
  DownstreamFileTask.prototype.onPayloadNeeded = function () {
    //dead end, because there is nothing to say
    var d = q.defer();
    return d.promise;
  };
  DownstreamFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename','cb'];
  return DownstreamFileTask;
}

module.exports = createDownstreamFileTask;
