function createDownloadFileTask(execlib, fileapi){
  'use strict';
  var fs = require('fs'),
    lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    SinkTask = execSuite.SinkTask,
    taskRegistry = execSuite.taskRegistry;

  function DownloadFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.localfilename = prophash.localfilename || prophash.filename;
    this.parsermodulename = prophash.parsermodulename;
    this.startfrom = prophash.firstrecordindex || 0;
    this.quantity = prophash.recordcount;
    this.cb = prophash.cb;
    this.mydb = !prophash.db;
    this.db = prophash.db || new fileapi.DataBase(prophash.root||process.cwd());
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
  lib.inherit(DownloadFileTask, SinkTask);
  DownloadFileTask.prototype.__cleanUp = function () {
    this.report = null;
    this.writeDefer = null;
    this.going = null;
    if(this.mydb){
      this.db.destroy();
    }
    this.db = null;
    this.mydb = null;
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
  DownloadFileTask.prototype.writerSucceeded = function (byteswritten) {
    this.report.size = byteswritten;
    if (this.cb){
      this.cb(this.report);
    }
    this.destroy();
  };
  DownloadFileTask.prototype.writerFailed = function (reason) {
    this.report.exception = reason;
    if (this.cb) {
      this.cb(this.report);
    }
    this.destroy();
  };
  DownloadFileTask.prototype.go = function () {
    if(this.going === true || this.going === null){
      return;
    }
    this.going = true;
    this.db.write(this.localfilename, {}, this.writeDefer).done(this.onWriter.bind(this));
  };
  DownloadFileTask.prototype.onWriter = function (writer) {
    if (!writer) {
      this.destroy();
      return;
    }
    this.report.filepath = writer.path;
    this.report.filename = writer.name;
    this.writer = writer;
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
      onIncomingPacket: this.writer.write.bind(this.writer),
      onOver: this.onTransmitOver.bind(this)
    });
  };
  DownloadFileTask.prototype.onTransmitOver = function () {
    this.writer.close();
  };
  DownloadFileTask.prototype.onPayloadNeeded = function () {
    //dead end, because there is nothing to say
    var d = q.defer();
    return d.promise;
  };
  DownloadFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename'];
  return DownloadFileTask;
}

module.exports = createDownloadFileTask;
