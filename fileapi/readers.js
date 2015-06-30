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

  FileReader.prototype.read = function (startfrom, quantityorbuffer, defer) {
    var size, buffer;
    if(quantityorbuffer instanceof Buffer){
      buffer = quantityorbuffer;
      size = buffer.length;
    }
    if ('number' === typeof quantityorbuffer) {
      size = quantityorbuffer;
      buffer = new Buffer(size);
    }
    if(!buffer){
      return this.readWhole(startfrom, defer);
    }
    defer = defer || q.defer();
    if(!('number' === typeof startfrom || startfrom instanceof Number)) {
      startfrom = null;
    }
    fs.read(this.fh, buffer, 0, size, startfrom, this._onBufferRead.bind(this, defer));
    return defer.promise;
  };
  FileReader.prototype._onBufferRead = function (defer, err, bytesread, buffer) {
    if (err) {
      defer.reject(err);
      this.fail(err);
      return;
    }
    if (bytesread !== buffer.length) {
      defer.notify(buffer.slice(0, bytesread));
    } else {
      defer.notify(buffer);
    }
    defer.resolve(bytesread);
  };

  FileReader.prototype.readWhole = function (startfrom, defer) {
    defer = defer || q.defer();
    this.size().done(this.onSizeForReadWhole.bind(this, startfrom, defer));
    return defer.promise;
  };
  FileReader.prototype.onSizeForReadWhole = function (startfrom, defer, size) { 
    if(!this.openDefer){
      defer.reject(new lib.Error('ALREADY_CLOSED','File is already closed'));
      return;
    }
    this.openDefer.promise.then(this.onOpenWithSizeForReadWhole.bind(this, startfrom, defer, size));
    this.open();
  };
  FileReader.prototype.onOpenWithSizeForReadWhole = function (startfrom, defer, size) {
    this.read(startfrom, size, defer);
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

  function ParsedFileReader(name, path, options, defer) {
    FileReader.call(this, name, path, defer);
    this.options = options;
  }
  lib.inherit(ParsedFileReader,FileReader);
  ParsedFileReader.prototype.destroy = function () {
    this.options = null;
    FileReader.prototype.destroy.call(this);
  };
  ParsedFileReader.prototype.go = function () {
    if(this.active){
      return;
    }
    this.active = true;
    if(this.options.modulename === '*'){
    }else{
      execlib.execSuite.parserRegistry.spawn(this.options.modulename, this.options.prophash).done(
        this.onParser.bind(this),
        this.fail.bind(this)
      );
    }
  };
  ParsedFileReader.prototype.onParser = function (parser) {
    if(lib.defined(parser.recordDelimiter)){
      var delim = parser.recordDelimiter, tord = typeof delim, start, quantity;
      if ('number' === tord) {
        if (!(this.options && this.options.raw)) {
          this.readInFixedChunks(delim, this.onRecordRead.bind(this, parser));
        } else {
          start = this.options.hasOwnProperty('startfrom') ? this.options.startfrom * delim : null;
          quantity = this.options.hasOwnProperty('quantity') ? this.options.quantity * delim : null;
          this.openDefer.promise.then(this.onOpenForRawRead.bind(this, start, quantity));
          this.open();
        }
      }
    }else{
      this.readWhole().done(
        this.onWholeReadDone.bind(this, parser),
        this.fail.bind(this),
        this.onWholeReadData.bind(this, parser)
      );
    }
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
  ParsedFileReader.prototype.onOpenForRawRead = function (start, quantity) {
    this.read(start, quantity).done(
      this.onRawReadDone.bind(this),
      this.fail.bind(this),
      this.notify.bind(this)
    );
  };
  ParsedFileReader.prototype.onWholeReadDone = function (parser, bytesread) {
    parser.destroy();
    this.close();
  };
  ParsedFileReader.prototype.onRawReadDone = function (bytesread) {
    this.result = bytesread;
    this.close();
  };
  ParsedFileReader.prototype.onWholeReadData = function (parser, buff) {
    this.result = parser.fileToData(buff);
  };


  function readerFactory(name, path, options, defer) {
    console.log('readerFactory',options);
    if(options.modulename){
      return new ParsedFileReader(name, path, options, defer);
    }
  }

  return readerFactory;
}

module.exports = createReaders;
