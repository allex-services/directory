function createTransmitFileTask(execlib){
  'use strict';
  var fs = require('fs'),
      lib = execlib.lib,
      q = lib.q,
      execSuite = execlib.execSuite,
      SinkTask = execSuite.SinkTask,
      taskRegistry = execSuite.taskRegistry,
      util = require('../fileapi/util')(execlib);
  function TransmitFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.sinkState = null;
    this.stateReader = null;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.remotefilename = prophash.remotefilename || prophash.filename;
    this.metadata = prophash.metadata;
    this.cb = prophash.cb;
    this.deleteonsuccess = prophash.deleteonsuccess || false;
    this.filepath = util.pathForFilename(prophash.root||process.cwd(),this.filename);
    this.file = null;
    this.filesize = util.fileSize(this.filepath);
    this.uploaded = 0;
    this.finished = false;
    this.buffer = new Buffer(64*1024);
  }
  lib.inherit(TransmitFileTask,SinkTask);
  TransmitFileTask.prototype.__cleanUp = function(){
    if(this.cb){
      this.cb(this.succeeded(), this.remotefilename);
    }
    if(this.file){
      fs.closeSync(this.file);
      if(this.succeeded() && this.deleteonsuccess){
        fs.unlinkSync(this.filepath);
      }
    }
    this.buffer = null;
    this.finished = null;
    this.uploaded = null;
    this.filesize = null;
    this.file = null;
    this.filepath = null;
    this.deleteonsuccess = null;
    this.cb = null;
    this.remotefilename = null;
    this.filename = null;
    this.ipaddress = null;
    if (this.stateReader) {
      this.stateReader.destroy();
    }
    this.stateReader = null;
    if (this.sinkState) {
      this.sinkState.destroy();
    }
    this.sinkState = null;
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
    try{
    taskRegistry.run('transmitTcp',{
      sink: this.sink,
      ipaddress: this.ipaddress,
      options: {
        filename: this.remotefilename,
        filesize: this.filesize,
        metadata: this.metadata
      },
      onPayloadNeeded: this.readChunk.bind(this),
      onRequestNotification: this.onUploadFilePath.bind(this)
    });
    } catch (e) {
      console.error(e.stack);
      console.error(e);
    }
  };
  TransmitFileTask.prototype.onUploadFilePath = function (uploadfilepath) {
    this.log('onUploadFilePath', uploadfilepath);
    this.remotefilename = uploadfilepath;
    this.sinkState = taskRegistry.run('materializeState',{
      sink: this.sink
    });
    this.stateReader = taskRegistry.run('readState',{
      state: this.sinkState,
      name: ['uploads',uploadfilepath],
      cb: this.onWriteConfirmed.bind(this)
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
    this.log('onWriteConfirmed', confirmed);
    if (isNaN(parseInt(confirmed))) {
      this.finished = confirmed === '*';
    } else {
      this.uploaded = confirmed;
    }
    if(this.succeeded() || confirmed === '!'){
      lib.runNext(this.destroy.bind(this));
    }
  };
  TransmitFileTask.prototype.succeeded = function () {
    return this.finished && this.uploaded === this.filesize;
  };
  TransmitFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename'];
  return TransmitFileTask;
}

module.exports = createTransmitFileTask;
