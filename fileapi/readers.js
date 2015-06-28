var fs = require('fs');

function createReaders(execlib,FileOperation,util) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q;

  function FileReader(name, path, defer) {
    FileOperation.call(this, name, path, defer);
  }
  lib.inherit(FileReader,FileOperation);
  FileReader.prototype.size = function () {
    var d = q.defer();
    util.fileSize(this.path,d);
    return d.promise;
  };

  FileReader.prototype.readWhole = function () {
    var d = q.defer();
    this.size().done(this.onSizeForReadWhole.bind(this,d));
    return d.promise;
  };
  FileReader.prototype.onSizeForReadWhole = function (defer, size) { 
    if(!this.openDefer){
      defer.reject(new lib.Error('ALREADY_CLOSED','File is already closed'));
      return;
    }
    this.openDefer.promise.then(this.onOpenWithSizeForReadWhole.bind(this, defer, size));
    this.open();
  };
  FileReader.prototype.onOpenWithSizeForReadWhole = function (defer, size) {
    fs.read(this.fh, new Buffer(size), 0, size, null, this._onWholeRead.bind(this,defer));
  };
  FileReader.prototype._onWholeRead = function (defer, err, bytesread, buff) {
    if(err){
      this.fail(err);
    }else{
      defer.resolve(buff);
    }
  };
  FileReader.prototype.readInFixedChunks = function (recordsize, processfn) {
    this.size().done(this.onSizeForFixedChunks.bind(this, recordsize, processfn));
  };
  FileReader.prototype.onSizeForFixedChunks = function (recordsize, processfn, size) {
    if (size%recordsize) {
      this.fail(new lib.Error('RECORD_SIZE_MISMATCH',this.name+' is of size '+size+' record of size '+recordsize+' cannot fit'));
      return;
    }
    this.openDefer.promise.then(this.readChunk.bind(this, new Buffer(recordsize), processfn));
    this.open();
  };
  FileReader.prototype.readChunk = function (buffer, processfn) {
    fs.read(this.fh, buffer, 0, buffer.length, null, this.onChunkRead.bind(this, processfn));
  };
  FileReader.prototype.onChunkRead = function (processfn, err, bytesread, buffer) {
    if (bytesread === buffer.length) {
      processfn(buffer).then(this.readChunk.bind(this, buffer, processfn));
    } else {
      processfn();
    }
  };
  FileReader.prototype.openMode = 'r';

  function FileTransmitter(name, path, defer) {
    FileReader.call(this, name, path, defer);
  }
  lib.inherit(FileTransmitter,FileReader);

  function ParsedFileReader(name, path, parsermodulename, parserpropertyhash, defer) {
    FileReader.call(this, name, path, defer);
    this.modulename = parsermodulename;
    this.prophash = parserpropertyhash;
  }
  lib.inherit(ParsedFileReader,FileReader);
  ParsedFileReader.prototype.destroy = function () {
    this.prophash = null;
    this.modulename = null;
    FileReader.prototype.destroy.call(this);
  };
  ParsedFileReader.prototype.go = function () {
    if(this.active){
      return;
    }
    this.active = true;
    if(this.modulename === '*'){
    }else{
      execlib.execSuite.parserRegistry.spawn(this.modulename, this.prophash).done(
        this.onParser.bind(this),
        this.fail.bind(this)
      );
    }
  };
  ParsedFileReader.prototype.onParser = function (parser) {
    if(lib.defined(parser.recordDelimiter)){
      var tord = typeof parser.recordDelimiter;
      if ('number' === tord) {
        this.readInFixedChunks(parser.recordDelimiter, this.onRecordRead.bind(this, parser));
      }
    }else{
      this.readWhole().done(this.onWholeRead.bind(this, parser));
    }
  };
  ParsedFileReader.prototype.onFinished = function (parser) {
  };
  ParsedFileReader.prototype.onRecordRead = function (parser, record) {
    var d, rec;
    if (!record) {
      rec = parser.finalize();
      if(lib.defined(rec)){
        this.notify(rec);
      }
      this.close();
      return;
    }
    d = q.defer();
    rec = parser.fileToData(record);
    if(lib.defined(rec)){
      this.notify(rec);
    }
    d.resolve(rec);
    return d.promise;
  };
  ParsedFileReader.prototype.onWholeRead = function (parser, buff) {
    this.result = parser.fileToData(buff);
    this.close();
  };


  function readerFactory(name, path, options, defer) {
    if(options.modulename){
      return new ParsedFileReader(name, path, options.modulename, options.propertyhash, defer);
    }
  }

  return readerFactory;
}

module.exports = createReaders;
