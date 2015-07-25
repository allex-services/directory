(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
ALLEX.execSuite.registry.add('allex_directoryservice',require('./clientside')(ALLEX));

},{"./clientside":2}],2:[function(require,module,exports){
function createClientSide(execlib){
  'use strict';
  var execSuite = execlib.execSuite,
  ParentServicePack = execSuite.registry.get('.');
  require('./parserregistryintroducer')(execlib);

  return {
    SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack),
    Tasks: require('./taskcreator')(execlib)
  };
}

module.exports = createClientSide;

},{"./parserregistryintroducer":12,"./sinkmapcreator":13,"./taskcreator":16}],3:[function(require,module,exports){
function createFileApi(execlib){
  'use strict';
  var util = require('./util')(execlib);

  return {
    DataBase: require('./dbcreator')(execlib, util),
    util: util
  };
}

module.exports = createFileApi;

},{"./dbcreator":4,"./util":7}],4:[function(require,module,exports){
function createHandler(execlib, util) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    FileOperation = require('./fileoperationcreator')(execlib,util),
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

},{"./fileoperationcreator":5,"./readers":6,"./writers":8}],5:[function(require,module,exports){
var fs = require('fs');
function createFileOperation(execlib, util) {
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
  FileOperation.prototype.size = function () {
    var d = q.defer();
    util.fileSize(this.path,d);
    return d.promise;
  };
  FileOperation.prototype.type = function () {
    var d = q.defer();
    util.fileType(this.path,d);
    return d.promise;
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

},{"fs":20}],6:[function(require,module,exports){
(function (Buffer){
var fs = require('fs'),
  Path = require('path');

function createReaders(execlib,FileOperation,util) {
  'use strict';
  var lib = execlib.lib,
    q = lib.q;

  function FileReader(name, path, defer) {
    FileOperation.call(this, name, path, defer);
  }
  lib.inherit(FileReader,FileOperation);

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
    console.log('reading',size,'bytes for buffer of size', buffer.length);
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
    if (this.options.parserinstance) {
      this.onParser(this.options.parserinstance);
    } else {
      if(this.options.modulename === '*'){
      }else{
        execlib.execSuite.parserRegistry.spawn(this.options.modulename, this.options.prophash).done(
          this.onParser.bind(this),
          this.fail.bind(this)
        );
      }
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
      if (parser.recordDelimiter instanceof Buffer) {
        console.log('time for readVariableLengthRecords', parser.recordDelimiter);
        this.openDefer.promise.done(this.readVariableLengthRecords.bind(this, parser, {offset:0}));
        this.open();
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
  ParsedFileReader.prototype.readVariableLengthRecords = function (parser, offsetobj) {
    var buff = new Buffer(1050);
    console.log('reading with offset', offsetobj.offset);
    this.read(offsetobj.offset, buff).done(
      this.onBufferReadForVariableLengthRecord.bind(this, parser, buff, offsetobj)
     );
  };
  ParsedFileReader.prototype.onBufferReadForVariableLengthRecord = function (parser, buff, offsetobj, bytesread) {
    console.log('bytes read', bytesread);
    if (!bytesread) {
      this.result = offsetobj.offset;
      this.close();
      return;
    }
    buff = buff.length === bytesread ? buff : buff.slice(0, bytesread);
    var records = parser.fileToData(buff);
    //console.log('records', records);
    //console.log(records.length, 'records');
    records.forEach(this.notify.bind(this));
    offsetobj.offset+=bytesread;
    this.readVariableLengthRecords(parser, offsetobj);
  };

  function DirReader(name, path, options, defer) {
    FileReader.call(this, name, path, defer);
    this.options = options;
    this.parserInfo = {
      needed: false,
      waiting: false,
      instance: null
    };
    if (this.options.filecontents) {
      this.parserInfo.needed = true;
      execlib.execSuite.parserRegistry.spawn(this.options.filecontents.modulename, this.options.filecontents.propertyhash).done(
        this.onParserInstantiated.bind(this),
        this.fail.bind(this)
      );
    }
  }
  lib.inherit(DirReader, FileReader);
  DirReader.prototype.destroy = function () {
    this.options = null;
    FileReader.prototype.destroy.call(this);
  };
  DirReader.prototype.go = function () {
    if(this.parserInfo.needed) {
      console.log('current parserInfo', this.parserInfo);
      if (!this.parserInfo.instance) {
        this.parserInfo.waiting = true;
        return;
      } else {
        this.parserInfo.waiting = false;
      }
    }
    this.type().then(
      this.onType.bind(this)
    );
  };
  DirReader.prototype.onParserInstantiated = function (parser) {
    console.log('parser instantiated', parser, 'current parserInfo', this.parserInfo);
    this.parserInfo.instance = parser;
    if (this.parserInfo.waiting) {
      this.go();
    }
  };
  DirReader.prototype.onType = function(type){
    if (type !== 'd') {
      this.fail(new lib.Error('WRONG_FILE_TYPE',this.name+' is not a directory'));
      return;
    }
    fs.readdir(this.path, this.onListing.bind(this));
  };
  DirReader.prototype.onListing = function (err, list) {
    if (err) {
      this.fail(err);
    } else {
      list.forEach(this.processFileName.bind(this));
    }
  };
  DirReader.prototype.processFileName = function (filename) {
    if (this.options.filestats) {
      fs.lstat(Path.join(this.path,filename), this.onFileStats.bind(this,filename));
    } else {
      this.reportFile(filename);
    }
  };
  DirReader.prototype.reportFile = function (filename, reportobj) {
    if (this.parserInfo.needed) {
      var d = q.defer(),
        parser = readerFactory(filename, Path.join(this.path,filename), {parserinstance:this.parserInfo.instance}, d);
      d.promise.done(
        console.log.bind(console,'parse done'),
        this.fail.bind(this),
        this.onParsedRecord.bind(this, reportobj || {})
      );
      parser.go();
    } else {
      this.notify(reportobj || filename);
    }
  };
  DirReader.prototype.onParsedRecord = function (statsobj, parsedrecord) {
    lib.traverse(statsobj,function(statsitem, statsname){
      parsedrecord[statsname] = statsitem;
    });
    this.notify(parsedrecord);
  };
  DirReader.prototype.onFileStats = function (filename, err, fstats, stats) {
    stats = stats || {};
    this.options.filestats.forEach(this.populateStats.bind(this,filename,fstats,stats));
    this.reportFile(filename,stats);
  };
  DirReader.prototype.populateStats = function (filename, fstats, stats, statskey) {
    var mn = 'extract_'+statskey, 
      m = this[mn];
    if ('function' !== typeof m){
      console.log('Method',mn,'does not exist to populate',statskey,'of filestats');
    } else {
      stats[statskey] = m.call(this, filename, fstats);
    }
  };
  DirReader.prototype.extract_filename = function (filename, fstats) {
    return filename;
  };
  DirReader.prototype.extract_filebasename = function (filename, fstats) {
    return Path.basename(filename,Path.extname(filename));
  };
  DirReader.prototype.extract_fileext = function (filename, fstats) {
    var ret = Path.extname(filename);
    return ret.charAt(0)==='.' ? ret.substring(1) : ret;
  };
  DirReader.prototype.extract_filetype = function (filename, fstats) {
    return util.typeFromStats(fstats);
  };
  DirReader.prototype.extract_created = function (filename, fstats) {
    return fstats.birthtime;
  };
  DirReader.prototype.extract_lastmodified = function (filename, fstats) {
    return fstats.mtime;
  };


  function readerFactory(name, path, options, defer) {
    if(options.modulename || options.parserinstance){
      return new ParsedFileReader(name, path, options, defer);
    }
    if(options.traverse){
      return new DirReader(name, path, options, defer);
    }
  }

  return readerFactory;
}

module.exports = createReaders;

}).call(this,require("buffer").Buffer)
},{"buffer":21,"fs":20,"path":25}],7:[function(require,module,exports){
(function (process){
var fs = require('fs'),
    Path = require('path'),
    mkdirp = require('mkdirp');

function satisfyPath(path){
  var p = Path.isAbsolute(path) ? path : Path.join(process.cwd(),path);
  mkdirp.sync(path);
}
function pathForFilename(path,filename){
  var ret = Path.join(path,filename);
  satisfyPath(Path.dirname(ret));
  return ret;
}
function typeFromStats(stats){
  if(stats.isFile()){
    return 'f';
  }
  if(stats.isDirectory()){
    return 'd';
  }
  if(stats.isBlockDevice()){
    return 'b';
  }
  if(stats.isCharacterDevice()){
    return 'c';
  }
  if(stats.isSymbolicLink()){
    return 'l';
  }
  if(stats.isSocket()){
    return 's';
  }
  if(stats.isFIFO()){
    return 'n'; //named pipe
  }
}
function fileType(filepath,defer){
  if(defer){
    fs.lstat(filepath,function(err,fstats){
      if(err){
        defer.resolve(0);
      }else{
        defer.resolve(typeFromStats(fstats));
      }
    });
  }else{
    try{
      var fstats = fs.lstatSync(filepath);
      return typeFromStats(fstats);
    }
    catch(e){
      return '';
    }
  }
}
function fileSize(filepath,defer){
  if(defer){
    fs.lstat(filepath,function(err,fstats){
      if(err){
        defer.resolve(0);
      }else{
        defer.resolve(fstats.size);
      }
    });
  }else{
    try{
      var fstats = fs.lstatSync(filepath);
      return fstats.size;
    }
    catch(e){
      return 0;
    }
  }
}

function createUtil(execlib){
  'use strict';
  return {
    satisfyPath: satisfyPath,
    pathForFilename: pathForFilename,
    fileSize: fileSize,
    fileType: fileType,
    typeFromStats: typeFromStats
  };
}

module.exports = createUtil;

}).call(this,require('_process'))
},{"_process":26,"fs":20,"mkdirp":11,"path":25}],8:[function(require,module,exports){
(function (Buffer){
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
  FileWriter.prototype.write = function (chunk, defer) {
    defer = defer || q.defer();
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
      this._performWriting(chunk, defer, {written:0});
    }
    return defer.promise;
  };
  FileWriter.prototype._performWriting = function (chunk, defer, writtenobj) {
    if(chunk instanceof Buffer){
      fs.write(this.fh, chunk, 0, chunk.length, null, this.onBufferWritten.bind(this, defer, writtenobj));
    }else{
      fs.write(this.fh, chunk, null, 'utf8', this.onStringWritten.bind(this, defer));
    }
  };
  FileWriter.prototype.onBufferWritten = function (defer, writtenobj, err, written, buffer) {
    if (err) {
      defer.reject(err);
      this.fail(err);
    } else {
      writtenobj.written += written;
      if (written === buffer.length) {
        this.finishWriting(defer, writtenobj.written);
      } else {
        this._performWriting(buffer.slice(written), defer, writtenobj);
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
    this.iswriting = false;
    defer.resolve(writtenbytes);
    var pending = this.q.pop();
    if(pending){
      this.iswriting = true;
      this._performWriting(pending[0],pending[1],{written:0});
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

  function PerFileParsedFileWriter(name, path, parsermodulename, parserpropertyhash, defer) {
    ParsedFileWriter.call(this,name, path, parsermodulename, parserpropertyhash, defer);
  }
  lib.inherit(PerFileParsedFileWriter, ParsedFileWriter);
  PerFileParsedFileWriter.prototype.go = function () {
    console.log('should write .parserinfo');
    ParsedFileWriter.prototype.go.call(this);
  };

  function writerFactory(name, path, options, defer) {
    if (options.modulename){
      if (options.typed) {
        return new ParsedFileWriter(name, path, options.modulename, options.propertyhash, defer);
      } else {
        return new PerFileParsedFileWriter(name, path, options.modulename, options.propertyhash, defer);
      }
    }
    return new RawFileWriter(name, path, defer);
  }
  return writerFactory;
}

module.exports = createWriters;

}).call(this,require("buffer").Buffer)
},{"buffer":21,"fs":20}],9:[function(require,module,exports){
module.exports = {
};

},{}],10:[function(require,module,exports){
module.exports = {
  fetch: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  }],
  write: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  },
  true
  ],
  append: [{
    title: 'filename',
    type: 'string'
  },{
    title: 'parser info hash (modulename,propertyhash)',
    type: 'object'
  },
  true
  ],
  traverse: [{
    title: 'Directory name',
    type: 'string'
  },{
    title: 'Traverse options',
    type: 'object'
  }]
};

},{}],11:[function(require,module,exports){
(function (process){
var path = require('path');
var fs = require('fs');
var _0777 = parseInt('0777', 8);

module.exports = mkdirP.mkdirp = mkdirP.mkdirP = mkdirP;

function mkdirP (p, opts, f, made) {
    if (typeof opts === 'function') {
        f = opts;
        opts = {};
    }
    else if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    var xfs = opts.fs || fs;
    
    if (mode === undefined) {
        mode = _0777 & (~process.umask());
    }
    if (!made) made = null;
    
    var cb = f || function () {};
    p = path.resolve(p);
    
    xfs.mkdir(p, mode, function (er) {
        if (!er) {
            made = made || p;
            return cb(null, made);
        }
        switch (er.code) {
            case 'ENOENT':
                mkdirP(path.dirname(p), opts, function (er, made) {
                    if (er) cb(er, made);
                    else mkdirP(p, opts, cb, made);
                });
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                xfs.stat(p, function (er2, stat) {
                    // if the stat fails, then that's super weird.
                    // let the original error be the failure reason.
                    if (er2 || !stat.isDirectory()) cb(er, made)
                    else cb(null, made);
                });
                break;
        }
    });
}

mkdirP.sync = function sync (p, opts, made) {
    if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }
    
    var mode = opts.mode;
    var xfs = opts.fs || fs;
    
    if (mode === undefined) {
        mode = _0777 & (~process.umask());
    }
    if (!made) made = null;

    p = path.resolve(p);

    try {
        xfs.mkdirSync(p, mode);
        made = made || p;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' :
                made = sync(path.dirname(p), opts, made);
                sync(p, opts, made);
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                var stat;
                try {
                    stat = xfs.statSync(p);
                }
                catch (err1) {
                    throw err0;
                }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }

    return made;
};

}).call(this,require('_process'))
},{"_process":26,"fs":20,"path":25}],12:[function(require,module,exports){
function parserRegistryIntroducer(execlib){
  'use strict';
  var lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    parserRegistry = execSuite.parserRegistry;
  if(parserRegistry){
    return;
  }
  /*
  function ParserRegistry(){
    lib.Map.call(this);
  }
  lib.inherit(ParserRegistry,lib.Map);
  ParserRegistry.prototype.register = function (modulename,defer) {
    defer = defer || q.defer();
    try{
      var parserctor = this.get(modulename);
      if(!parserctor){
        parserctor = require(modulename)(execlib);
        if('function' === typeof parserctor.done){
          parserctor.done(this.finalizeRegister.bind(this, modulename, defer));
        }else{
          this.finalizeRegister(modulename, defer, parserctor);
        }
      } else {
        defer.resolve(parserctor);
      }
    }
    catch(e){
      if(execSuite.installFromError){
        execSuite.installFromError(this.onInstallFromError.bind(this,modulename,defer,e),e);
      }else{
        console.log(e.stack);
        console.log(e);
        defer.reject(e);
      }
    }
    return defer.promise;
  };
  ParserRegistry.prototype.finalizeRegister = function (modulename, defer, parserctor) {
    this.add(modulename, parserctor);
    defer.resolve(parserctor);
  };
  ParserRegistry.prototype.spawn = function (modulename, prophash) {
    var d = q.defer();
    this.register(modulename).done(
      function(parserctor){
        d.resolve(new parserctor(prophash||{}));
      },
      d.reject.bind(d)
    );
    return d.promise;
  };
  ParserRegistry.prototype.onInstallFromError = function (modulename,defer,error,ok) {
    if(ok){
      this.register(modulename,defer);
    }else{
      defer.reject(error);
    }
  };
  */
  execSuite.parserRegistry = new execSuite.RegistryBase();
}

module.exports = parserRegistryIntroducer;

},{}],13:[function(require,module,exports){
function sinkMapCreator(execlib,ParentServicePack){
  'use strict';
  var sinkmap = new (execlib.lib.Map), ParentSinkMap = ParentServicePack.SinkMap;
  sinkmap.add('service',require('./sinks/servicesinkcreator')(execlib,ParentSinkMap.get('service')));
  sinkmap.add('user',require('./sinks/usersinkcreator')(execlib,ParentSinkMap.get('user')));
  
  return sinkmap;
}

module.exports = sinkMapCreator;

},{"./sinks/servicesinkcreator":14,"./sinks/usersinkcreator":15}],14:[function(require,module,exports){
function createServiceSink(execlib,ParentSink){
  'use strict';

  if(!ParentSink){
    ParentSink = execlib.execSuite.registry.get('.').SinkMap.get('user');
  }

  function ServiceSink(prophash,client){
    ParentSink.call(this,prophash,client);
  }
  ParentSink.inherit(ServiceSink,require('../methoddescriptors/serviceuser'));
  ServiceSink.prototype.__cleanUp = function(){
    ParentSink.prototype.__cleanUp.call(this);
  };
  return ServiceSink;
}

module.exports = createServiceSink;

},{"../methoddescriptors/serviceuser":9}],15:[function(require,module,exports){
function createUserSink(execlib,ParentSink){
  'use strict';

  if(!ParentSink){
    ParentSink = execlib.execSuite.registry.get('.').SinkMap.get('user');
  }

  function UserSink(prophash,client){
    ParentSink.call(this,prophash,client);
  }
  ParentSink.inherit(UserSink,require('../methoddescriptors/user'));
  UserSink.prototype.__cleanUp = function(){
    ParentSink.prototype.__cleanUp.call(this);
  };
  return UserSink;
}

module.exports = createUserSink;

},{"../methoddescriptors/user":10}],16:[function(require,module,exports){
function createTasks(execlib){
  'use strict';
  return [{
    name: 'fetchOrCreateWithData',
    klass: require('./tasks/fetchOrCreateWithData')(execlib)
  },{
    name: 'transmitFile',
    klass: require('./tasks/transmitFile')(execlib)
  },{
    name: 'downloadFile',
    klass: require('./tasks/downloadFile')(execlib)
  }];
}

module.exports = createTasks;

},{"./tasks/downloadFile":17,"./tasks/fetchOrCreateWithData":18,"./tasks/transmitFile":19}],17:[function(require,module,exports){
(function (process){
function createDownloadFileTask(execlib){
  'use strict';
  var fs = require('fs'),
    lib = execlib.lib,
    q = lib.q,
    execSuite = execlib.execSuite,
    SinkTask = execSuite.SinkTask,
    taskRegistry = execSuite.taskRegistry,
    fileapi = require('../fileapi/creator')(execlib);

  function DownloadFileTask(prophash){
    SinkTask.call(this,prophash);
    this.sink = prophash.sink;
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.localfilename = prophash.localfilename || prophash.filename;
    this.parsermodulename = prophash.parsermodulename;
    this.startfrom = prophash.firstrecordindex || 0;
    this.quantity = prophash.recordcount;
    this.cb = prophash.cb;
    this.mydb = !prophash.db;
    this.db = prophash.db || new fileapi.DataBase(prophash.root||process.cwd());
    this.going = false;
    this.writeDefer = q.defer();
    this.report = {};
    this.writeDefer.promise.done(
      this.writerSucceeded.bind(this),
      this.writerFailed.bind(this),
      function(record){
        console.log(record,'written');
      }
    );
  }
  lib.inherit(DownloadFileTask, SinkTask);
  DownloadFileTask.prototype.__cleanUp = function () {
    this.report = null;
    this.writeDefer = null;
    this.going = null;
    if(this.mydb){
      this.db.destroy();
    }
    this.db = null;
    this.mydb = null;
    this.cb = null;
    this.quantity = null;
    this.startfrom = null;
    this.parsermodulename = null;
    this.localfilename = null;
    this.filename = null;
    this.ipaddress = null;
    this.sink = null;
    SinkTask.prototype.__cleanUp.call(this);
  };
  DownloadFileTask.prototype.writerSucceeded = function (byteswritten) {
    this.report.size = byteswritten;
    if (this.cb){
      this.cb(this.report);
    }
    this.destroy();
  };
  DownloadFileTask.prototype.writerFailed = function (reason) {
    this.report.exception = reason;
    if (this.cb) {
      this.cb(this.report);
    }
    this.destroy();
  };
  DownloadFileTask.prototype.go = function () {
    if(this.going === true || this.going === null){
      return;
    }
    this.going = true;
    this.db.write(this.localfilename, {}, this.writeDefer).done(this.onWriter.bind(this));
  };
  DownloadFileTask.prototype.onWriter = function (writer) {
    if (!writer) {
      this.destroy();
      return;
    }
    this.report.filepath = writer.path;
    this.report.filename = writer.name;
    this.writer = writer;
    taskRegistry.run('transmitTcp', {
      sink: this.sink,
      ipaddress: this.ipaddress,
      options: {
        filename: this.filename,
        modulename: this.parsermodulename,
        startfrom: this.startfrom,
        quantity: this.quantity,
        download: true
      },
      onPayloadNeeded: this.onPayloadNeeded.bind(this),
      onIncomingPacket: this.writer.write.bind(this.writer),
      onOver: this.onTransmitOver.bind(this)
    });
  };
  DownloadFileTask.prototype.onTransmitOver = function () {
    this.writer.close();
  };
  DownloadFileTask.prototype.onPayloadNeeded = function () {
    //dead end, because there is nothing to say
    var d = q.defer();
    return d.promise;
  };
  DownloadFileTask.prototype.compulsoryConstructionProperties = ['sink','ipaddress','filename'];
  return DownloadFileTask;
}

module.exports = createDownloadFileTask;

}).call(this,require('_process'))
},{"../fileapi/creator":3,"_process":26,"fs":20}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
(function (process,Buffer){
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
    this.ipaddress = prophash.ipaddress;
    this.filename = prophash.filename;
    this.remotefilename = prophash.remotefilename || prophash.filename;
    this.cb = prophash.cb;
    this.deleteonsuccess = prophash.deleteonsuccess || false;
    this.filepath = util.pathForFilename(prophash.root||process.cwd(),this.filename);
    this.file = null;
    this.filesize = util.fileSize(this.filepath);
    this.succeeded = false;
    this.buffer = new Buffer(64*1024);
  }
  lib.inherit(TransmitFileTask,SinkTask);
  TransmitFileTask.prototype.__cleanUp = function(){
    if(this.cb){
      this.cb(this.succeeded);
    }
    if(this.file){
      fs.closeSync(this.file);
      if(this.succeeded && this.deleteonsuccess){
        fs.unlinkSync(this.filepath);
      }
    }
    this.buffer = null;
    this.succeeded = null;
    this.filesize = null;
    this.file = null;
    this.filepath = null;
    this.deleteonsuccess = null;
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
    try{
    taskRegistry.run('readState',{
      state: taskRegistry.run('materializeState',{
        sink: this.sink
      }),
      name: ['uploads',this.remotefilename],
      cb: this.onWriteConfirmed.bind(this)
    });
    taskRegistry.run('transmitTcp',{
      sink: this.sink,
      ipaddress: this.ipaddress,
      options: {
        filename: this.remotefilename,
        filesize: this.filesize
      },
      onPayloadNeeded: this.readChunk.bind(this)
    });
    } catch (e) {
      console.error(e.stack);
      console.error(e);
    }
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

}).call(this,require('_process'),require("buffer").Buffer)
},{"../fileapi/util":7,"_process":26,"buffer":21,"fs":20}],20:[function(require,module,exports){

},{}],21:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  function Foo () {}
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    arr.constructor = Foo
    return arr.foo() === 42 && // typed array instances can be augmented
        arr.constructor === Foo && // constructor can be set
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined' && object.buffer instanceof ArrayBuffer) {
    return fromTypedArray(that, object)
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":22,"ieee754":23,"is-array":24}],22:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],23:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],24:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],25:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":26}],26:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1]);
