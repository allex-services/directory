function createTransmitFileTask(execlib, fileapi){
  'use strict';
  var fs = require('fs'),
      lib = execlib.lib,
      q = lib.q,
      execSuite = execlib.execSuite,
      SinkTask = execSuite.SinkTask,
      taskRegistry = execSuite.taskRegistry,
      util = fileapi.util;

  function BufferPool () {
    this.buffers = [];
  }
  BufferPool.prototype.destroy = function () {
    this.buffers = null;
  };
  BufferPool.prototype.give = function () {
    var ret;
    if (!this.buffers) {
      return null;
    }
    ret = this.buffers.pop();
    if (!ret) {
      return Buffer.alloc(64*1024);
    }
    return ret;
  };
  BufferPool.prototype.take = function (buff) {
    if (!this.buffers) {
      return;
    }
    this.buffers.push(buff);
  };

  var _BufferPool = new BufferPool();

  function TransmitFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.remotefilename = prophash.remotefilename || prophash.filename;
    this.metadata = prophash.metadata;
    this.cb = prophash.cb;
    this.errorcb = prophash.errorcb;
    this.deleteonsuccess = prophash.deleteonsuccess || false;
    this.filepath = util.pathForFilename(prophash.root||process.cwd(),this.filename);
    this.file = null;
    this.filesize = util.fileSize(this.filepath);
    this.uploaded = 0;
    this.finished = false;
    this.buffer = _BufferPool.give(); //Buffer.alloc(64*1024);
    this.transmissionid = null;
  }
  lib.inherit(TransmitFileTask,SinkTask);
  TransmitFileTask.prototype.__cleanUp = function(){
    if(this.file){
      fs.closeSync(this.file);
      if(this.succeeded() && this.deleteonsuccess){
        fs.unlinkSync(this.filepath);
      }
    }
    if(this.cb){
      this.cb(this.succeeded(), this.remotefilename);
    }
    this.transmissionid = null;
    if (this.buffer) {
      _BufferPool.take(this.buffer);
    }
    this.buffer = null;
    this.finished = null;
    this.uploaded = null;
    this.filesize = null;
    this.file = null;
    this.filepath = null;
    this.deleteonsuccess = null;
    this.errorcb = null;
    this.cb = null;
    this.remotefilename = null;
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
    this.sink.sessionCall('beginFileUpload',
      this.remotefilename,
      this.filesize,
      false,
      this.metadata
    ).then(
      this.beginTransmission.bind(this),
      this.onTransmissionError.bind(this, 'beginFileUpload')
    );
  };
  /*
    try{
    this.transmitTask = taskRegistry.run('transmitTcp',{
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
  */
  TransmitFileTask.prototype.beginTransmission = function (id) {
    this.transmissionid = id;
    this.transmitFileChunk();
  }
  TransmitFileTask.prototype.transmitFileChunk = function (bytes) {
    var chunk;
    this.uploaded += (bytes||0);
    chunk = this.readChunk();
    if (!chunk) {
      this.finished = true;
      this.sink.sessionCall('finishFileUpload', this.remotefilename, this.transmissionid).then(
        this.onAllDone.bind(this),
        this.onTransmissionError.bind(this, 'finishFileUpload')
      );
      return;
    }
    this.sink.sessionCall('uploadFileChunk', this.remotefilename, this.transmissionid, chunk).then(
      this.transmitFileChunk.bind(this),
      this.onTransmissionError.bind(this, 'uploadFileChunk')
    );
  };
  TransmitFileTask.prototype.readChunk = function(){
    if(!this.file){
      console.log(this.filename,'has no filehandle, reporting null which will close the socket');
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
    if (isNaN(parseInt(confirmed))) {
      this.finished = this.finished || (confirmed === '*');
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
  TransmitFileTask.prototype.onTransmissionError = function (title, reason) {
    if (reason) {
      reason.source = title;
    }
    if (!lib.isFunction(this.destroy)) {
      console.log('Who dafuq am I?');
      console.log(this);
      process.exit(1);
    }
    this.destroy(reason);
  };
  TransmitFileTask.prototype.onError = function (reason) {
    if (lib.isFunction(this.errorcb)) {
      this.errorcb(reason);
    }
  };
  TransmitFileTask.prototype.onAllDone = function (ignore) {
    this.destroy();
  };
  //TransmitFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename'];
  TransmitFileTask.prototype.compulsoryConstructionProperties = ['sink','filename'];
  return TransmitFileTask;
}

module.exports = createTransmitFileTask;
