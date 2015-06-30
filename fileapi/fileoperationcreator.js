var fs = require('fs');
function createFileOperation(execlib) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q;

  //TODO: it's still unclear if 
  //this.openDefer should be rejected in case
  //FileOperation gets destroyed without opening
  //the file...
  function FileOperation(name, path, defer) {
    this.name = name;
    this.path = path;
    this.defer = defer;
    this.result = null;
    this.error = null;
    this.active = false;
    this.fh = null;
    this.openDefer = q.defer();
  };
  FileOperation.prototype.destroy = function () {
    this.openDefer = null;
    if(this.fh){
      this.close();
      return;
    }
    this.fh = null;
    if (this.active === null) {
      return;
    }
    if(this.defer){
      if(this.error){
        this.defer.reject(this.error);
      }else{
        this.defer.resolve(this.result);
      }
    }
    this.active = null;
    this.error = null;
    this.result = null;
    this.defer = null;
    this.path = null;
    this.name = null;
  };
  FileOperation.prototype.notify = function(obj){
    if(!this.defer){
      return;
    }
    this.defer.notify(obj);
  };
  FileOperation.prototype.fail = function(reason){
    if(!this.defer){
      return;
    }
    this.error = reason;
    this.close();
  };
  FileOperation.prototype.announceOpen = function (fh) {
    if(this.isopen){
      return;
    }
    this.fh = fh;
    this.openDefer.resolve(this);
  };
  FileOperation.prototype.open = function () {
    fs.open(this.path,this.openMode,this.onOpen.bind(this));
  };
  FileOperation.prototype.onOpen = function (err, fh) {
    if(err){
      this.fail(err);
    }else{
      this.announceOpen(fh);
    }
  };
  FileOperation.prototype.close = function () {
    if(this.fh){
      fs.close(this.fh,this.onClosed.bind(this));
    }else{
      this.destroy();
    }
  };
  FileOperation.prototype.onClosed = function () {
    this.fh = null;
    this.destroy();
  };

  return FileOperation;
}

module.exports = createFileOperation;
