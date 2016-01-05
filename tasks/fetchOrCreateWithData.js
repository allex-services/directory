function createFetchOrCreateWithDataTask(execlib){
  'use strict';
  var lib = execlib.lib,
      q = lib.q,
      execSuite = execlib.execSuite,
      SinkTask = execSuite.SinkTask;
  function FetchOrCreateWithDataTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.filename = prophash.filename;
    this.data = prophash.data;
    this.parserinfo = {
      parsermodulename: prophash.parsermodulename,
      modulename: prophash.parsermodulename,
      propertyhash: prophash.parserpropertyhash
    };
    this.cb = prophash.cb;
    this.singleshot = prophash.singleshot;
  }
  lib.inherit(FetchOrCreateWithDataTask,SinkTask);
  FetchOrCreateWithDataTask.prototype.__cleanUp = function(){
    this.singleshot = null;
    this.cb = null;
    this.parserinfo = null;
    this.data = null;
    this.filename = null;
    this.sink = null;
    SinkTask.prototype.__cleanUp.call(this);
  };
  FetchOrCreateWithDataTask.prototype.go = function(){
    this.sink.call('fetch',this.filename,this.parserinfo).done(
      this.triggerCb.bind(this),
      this.onError.bind(this)
    );
  };
  FetchOrCreateWithDataTask.prototype.onError = function(reason){
    if(reason.code === 'ENOENT'){
      this.sink.call('write',this.filename,this.parserinfo,this.data).done(
        this.onWriteSuccess.bind(this),
        this.destroy.bind(this)
      );
    }else{
      console.error('unrecoverable error',reason,'fetchOrCreateWithData task will end now');
      this.destroy();
    }
  };
  FetchOrCreateWithDataTask.prototype.onWriteSuccess = function(writeresult){
    this.triggerCb(this.data);
  };
  FetchOrCreateWithDataTask.prototype.triggerCb = function(data){
    this.cb(data);
    if(this.singleshot){
      this.destroy();
    }
  };
  FetchOrCreateWithDataTask.prototype.compulsoryConstructionProperties = ['sink','filename','data','parsermodulename','cb'];
  return FetchOrCreateWithDataTask;
}

module.exports = createFetchOrCreateWithDataTask;
