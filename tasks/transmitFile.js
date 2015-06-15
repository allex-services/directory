function createTransmitFileTask(execlib){
  'use strict';
  var fs = require('fs'),
      lib = execlib.lib,
      q = lib.q,
      execSuite = execlib.execSuite,
      SinkTask = execSuite.SinkTask,
      taskRegistry = execSuite.taskRegistry,
      util = require('../util')(execlib);
  function TransmitFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.deleteonsuccess = prophash.deleteonsuccess || false;
    this.filepath = util.pathForFilename(prophash.root||process.cwd(),this.filename);
    this.file = null;
    this.filesize = util.fileSize(this.filepath);
    this.succeeded = false;
    this.buffer = new Buffer(64*1024);
  }
  lib.inherit(TransmitFileTask,SinkTask);
  TransmitFileTask.prototype.__cleanUp = function(){
    if(this.file){
      fs.closeSync(this.file);
      if(this.succeeded && this.deleteonsuccess){
        fs.unlinkSync(this.filepath);
      }
    }
    this.buffer = null;
    this.succeeded = null;
    this.file = null;
    this.filepath = null;
    this.deleteonsuccess = null;
    this.filename = null;
    this.ipaddress = null;
    this.sink = null;
    SinkTask.prototype.__cleanUp.call(this);
  };
  TransmitFileTask.prototype.go = function(){
    this.file = fs.open(this.filepath,'r',this.goToTransmission.bind(this));
  };
  TransmitFileTask.prototype.goToTransmission = function(fileopenerror,filehandle){
    if(fileopenerror){
      return this.destroy();
    }
    this.file = filehandle;
    taskRegistry.run('readState',{
      state: taskRegistry.run('materializeState',{
        sink: this.sink
      }),
      name: ['uploads',this.filename],
      cb: this.onWriteConfirmed.bind(this)
    });
    taskRegistry.run('transmitTcp',{
      sink: this.sink,
      ipaddress: this.ipaddress,
      options: {
        filename: this.filename,
        filesize: this.filesize
      },
      onPayloadNeeded: this.readChunk.bind(this)
    });
  };
  TransmitFileTask.prototype.readChunk = function(){
    if(!this.file){
      return null;
    }
    var read = fs.readSync(this.file,this.buffer,0,this.buffer.length,null), buff;
    if(read===this.buffer.length){
      buff = this.buffer;
    }else{
      if(read===0){
        buff = null;
      }else{
        buff = this.buffer.slice(0,read);
      }
    }
    return buff;
  };
  TransmitFileTask.prototype.onWriteConfirmed = function(confirmed){
    this.succeeded = confirmed === this.filesize;
    if(this.succeeded){
      lib.runNext(this.destroy.bind(this));
    }
  };
  TransmitFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename'];
  return TransmitFileTask;
}

module.exports = createTransmitFileTask;
