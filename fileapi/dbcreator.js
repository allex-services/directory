function createHandler(execlib, util) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    FileOperation = require('./fileoperationcreator')(execlib),
    readerFactory = require('./readers')(execlib,FileOperation,util),
    writerFactory = require('./writers')(execlib,FileOperation);

  function FileQ(database, name, path) {
    lib.Fifo.call(this);
    var fq = database.get(name);
    if(fq){
      return fq;
    }
    this.database = database;
    this.name = name;
    this.path = path;
    this.writePromise = null;
    this.activeReaders = 0;
    database.add(name,this);
  }
  lib.inherit(FileQ,lib.Fifo);
  FileQ.prototype.destroy = function () {
    this.database.remove(this.name);
    this.activeReaders = null;
    this.writePromise = null;
    this.path = null;
    this.name = null;
    this.database = null;
    lib.Fifo.prototype.call(this);
  };
  FileQ.prototype.read = function (options, defer) {
    defer = defer || q.defer();
    this.handleReader(readerFactory(this.name, this.path, options, defer));
    return defer.promise;
  };
  FileQ.prototype.write = function (options, defer) {
    var writer = writerFactory(this.name, this.path, options, defer);
    this.handleWriter(writer);
    return writer.openDefer.promise;
  };
  FileQ.prototype.handleReader = function (reader) {
    if (this.writePromise) {
      this.push(reader);
    }else{
      this.activeReaders++;
      reader.defer.promise.then(this.readerDown.bind(this));
      reader.go();
    }
  };
  FileQ.prototype.handleWriter = function (writer) {
    if (this.writePromise) {
      this.push(reader);
    }else{
      this.writePromise = writer.defer.promise;
      this.writePromise.then(this.writerDown.bind(this));
      writer.go();
    }
  };
  FileQ.prototype.readerDown = function () {
    this.activeReaders--;
    this.handleQ();
  };
  FileQ.prototype.writerDown = function () {
    this.writePromise = null;
    this.handleQ();
  };
  FileQ.prototype.handleQ = function () {
    console.log('time for next');
  };

  function FileDataBase(rootpath){
    lib.Map.call(this);
    this.rootpath = rootpath;
    this.closingDefer = null;
  }
  lib.inherit(FileDataBase,lib.Map);
  FileDataBase.prototype.destroy = function () {
    if(this.closingDefer) {
      if(this.count){
        this.closingDefer.notify(this.count);
        return;
      }
      this.closingDefer.resolve(true);
    }
    this.rootpath = null;
    this.closingDefer = null;
    lib.Map.prototype.destroy.call(this);
  };
  /*
  FileDataBase.prototype.add = function (name) {
    if(this.closingDefer){
      return null;
    }
    if (!name) {
      return null;
    }
    return this.fileQ(name);
  };
  */
  FileDataBase.prototype.read = function (name, options, defer) {
    if(this.closingDefer){
      if(defer){
        defer.resolve();
      }
      return;
    }
    return this.fileQ(name).read(options, defer);
  };
  FileDataBase.prototype.write = function (name, options, defer) {
    if(this.closingDefer){
      if(defer){
        defer.resolve();
      }
      return;
    }
    return this.fileQ(name).write(options,defer);
  };
  FileDataBase.prototype.fileQ = function (name) {
    return new FileQ(this, name, util.pathForFilename(this.rootpath,name));
  };

  return FileDataBase;
}

module.exports = createHandler;
