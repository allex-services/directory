var fs = require('fs');
function createWriters(execlib,FileOperation) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q;

  function FileWriter(name, path, defer, append){
    FileOperation.call(this, name, path, defer);
    this.openMode = append ? 'a' : 'w';
    this.iswriting = false;
    this.q = new lib.Fifo();
  }
  lib.inherit(FileWriter,FileOperation);
  FileWriter.prototype.destroy = function () {
    if (this.isopen === null) {
      return;
    }
    if(!this.q){
      return;
    }
    //TODO: this.q needs to be cleaned with all the defers within handled properly
    this.q.destroy();
    this.q = null;
    this.iswriting = null;
    this.openMode = null;
    FileOperation.prototype.destroy.call(this);
  };
  FileWriter.prototype.go = function () {
    if (this.active) {
      return;
    }
    this.active = true;
    this.open();
  };
  FileWriter.prototype.write = function (chunk, defer, writtenobj) {
    defer = defer || q.defer();
    writtenobj = writtenobj || {written:0};
    if(this.isopen === false){
      defer.reject(new lib.Error('NOT_OPEN',this.name+' is not opened yet'));
      return defer.promise;
    }
    if(this.iswriting===null){
      defer.reject(new lib.Error('ALREADY_CLOSED','File is already closed'));
      return defer.promise;
    }
    if(this.iswriting){
      this.q.push([chunk, defer]);
    }else{
      this.iswriting = true;
      if(chunk instanceof Buffer){
        fs.write(this.fh, chunk, 0, chunk.length, null, this.onBufferWritten.bind(this,defer, writtenobj));
      }else{
        fs.write(this.fh, chunk, null, 'utf8', this.onStringWritten.bind(this,defer, writtenobj));
      }
    }
    return defer.promise;
  };
  FileWriter.prototype.onBufferWritten = function (defer, writtenobj, err, written, buffer) {
    this.iswriting = false;
    if (err) {
      defer.reject(err);
      this.fail(err);
    } else {
      writtenobj.written += written;
      if (written === buffer.length) {
        this.finishWriting(defer, writtenobj.written);
      } else {
        this.write(buffer.slice(written), defer);
      }
    }
  };
  FileWriter.prototype.onStringWritten = function (defer, err, written, string) {
    if (err) {
      defer.reject(err);
      this.fail(err);
    } else {
      this.finishWriting(defer, written);
    }
  };
  FileWriter.prototype.finishWriting = function (defer, writtenbytes) {
    defer.resolve(writtenbytes);
    var pending = this.q.pop();
    if(pending){
      this.write(pending[0],pending[1]);
    }
  };

  function RawFileWriter(name, path, defer){
    FileWriter.call(this, name, path, defer);
    this.result = 0;
  }
  lib.inherit(RawFileWriter, FileWriter);
  RawFileWriter.prototype.write = function (chunk, defer) {
    defer = defer || q.defer();
    FileWriter.prototype.write.call(this, chunk, defer).done(
      this.onWritten.bind(this)
    )
    return defer.promise;
  };
  RawFileWriter.prototype.onWritten = function (bytes) {
    console.log('written', bytes, 'bytes');
    this.result += bytes;
  };

  function ParsedFileWriter(name, path, parsermodulename, parserpropertyhash, defer) {
    FileWriter.call(this, name, path, defer);
    this.modulename = parsermodulename;
    this.prophash = parserpropertyhash;
    this.parser = null;
  }
  lib.inherit(ParsedFileWriter,FileWriter);
  ParsedFileWriter.prototype.destroy = function () {
    if (this.parser) {
      this.parser.destroy();
    }
    this.parser = null;
    this.prophash = null;
    this.modulename = null;
    FileWriter.prototype.destroy.call(this);
  };
  ParsedFileWriter.prototype.go = function () {
    if(this.active){
      return;
    }
    this.active = true;
    execlib.execSuite.parserRegistry.spawn(this.modulename, this.prophash).done(
      this.onParser.bind(this),
      this.fail.bind(this)
    );
  };
  ParsedFileWriter.prototype.onParser = function (parser) {
    this.parser = parser;
    this.open();
  };
  ParsedFileWriter.prototype.write = function (object, defer) {
    var chunk;
    defer = defer || q.defer();
    if(!object){
      defer.reject();
    }else{
      chunk = this.parser.dataToFile(object);
      if(chunk){
        FileWriter.prototype.write.call(this, chunk, defer);
      }else{
        defer.reject(object);
      }
    }
    return defer.promise;
  };
  ParsedFileWriter.prototype.writeAll = function (object) {
    this.write(object).then(this.onAllWritten.bind(this, object));
  };
  ParsedFileWriter.prototype.onAllWritten = function (object) {
    this.result = object;
    this.close();
  };

  function writerFactory(name, path, options, defer) {
    if (options.modulename){
      return new ParsedFileWriter(name, path, options.modulename, options.propertyhash, defer);
    }
    return new RawFileWriter(name, path, defer);
  }
  return writerFactory;
}

module.exports = createWriters;
