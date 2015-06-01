function createFetchOrCreateWithDataTask(execlib){
  var lib = execlib.lib,
      q = lib.q,
      execSuite = execlib.execSuite,
      SinkTask = execSuite.SinkTask;
  function FetchOrCreateWithDataTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.filename = prophash.filename;
    this.data = prophash.data;
    this.cb = prophash.cb;
    this.singleshot = prophash.singleshot;
  }
  lib.inherit(FetchOrCreateWithDataTask,SinkTask);
  FetchOrCreateWithDataTask.prototype.__cleanUp = function(){
    this.singleshot = null;
    this.cb = null;
    this.data = null;
    this.filename = null;
    this.sink = null;
    SinkTask.prototype.__cleanUp.call(this);
  };
  FetchOrCreateWithDataTask.prototype.go = function(){
    this.sink.call('fetch',this.filename).done(
      this.onSuccess.bind(this),
      this.onError.bind(this)
    );
  };
  FetchOrCreateWithDataTask.prototype.onSuccess = function(data){
    this.cb(data);
    if(this.singleshot){
      this.destroy();
    }
  };
  FetchOrCreateWithDataTask.prototype.onError = function(reason){
    console.error('onError',reason);
    if(reason.code === 'ENOENT'){
      this.sink.call('write',this.filename,this.data).done(
        this.onWriteSuccess.bind(this),
        this.destroy.bind(this)
      );
    }
  };
  FetchOrCreateWithDataTask.prototype.onWriteSuccess = function(writeresult){
    this.cb(this.data);
  };
  FetchOrCreateWithDataTask.prototype.compulsoryConstructionProperties = ['sink','filename','data','cb'];
  return FetchOrCreateWithDataTask;
}

module.exports = createFetchOrCreateWithDataTask;
