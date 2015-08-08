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
    //console.log('reading',size,'bytes for buffer of size', buffer.length);
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
    var processresult;
    if (bytesread === buffer.length) {
      processresult = processfn(buffer);
      //attempt to support possible async parsing; for now the parsing is synchronous
      if (processresult && 'function' === typeof processresult.then) {
        processresult.then(this.readChunk.bind(this, buffer, processfn));
      } else {
        this.readChunk(buffer,processfn);
      }
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
          this.result = 0;
          this.readInFixedChunks(delim, this.onRecordRead.bind(this, parser));
        } else {
          start = this.options.hasOwnProperty('startfrom') ? this.options.startfrom * delim : null;
          quantity = this.options.hasOwnProperty('quantity') ? this.options.quantity * delim : null;
          this.openDefer.promise.then(this.onOpenForRawRead.bind(this, start, quantity));
          this.open();
        }
      }
      if (parser.recordDelimiter instanceof Buffer) {
        //console.log('time for readVariableLengthRecords', parser.recordDelimiter);
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
    var rec;
    if (!record) {
      rec = parser.finalize();
      if(lib.defined(rec)){
        this.result++;
        this.notify(rec);
      }
      this.close();
      return;
    }
    rec = parser.fileToData(record);
    if(lib.defined(rec)){
      this.result++;
      this.notify(rec);
    }
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
    //console.log('reading with offset', offsetobj.offset);
    this.read(offsetobj.offset, buff).done(
      this.onBufferReadForVariableLengthRecord.bind(this, parser, buff, offsetobj)
     );
  };
  ParsedFileReader.prototype.onBufferReadForVariableLengthRecord = function (parser, buff, offsetobj, bytesread) {
    //console.log('bytes read', bytesread);
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
    this.filecount = 0;
    this.options = options;
    this.parserInfo = {
      needed: false,
      waiting: false,
      instance: null
    };
    if (this.options.filecontents) {
      this.parserInfo.needed = true;
      if (this.options.filecontents.modulename !== '*') {
        execlib.execSuite.parserRegistry.spawn(this.options.filecontents.modulename, this.options.filecontents.propertyhash).done(
          this.onParserInstantiated.bind(this),
          this.fail.bind(this)
        );
      }
    }
  }
  lib.inherit(DirReader, FileReader);
  DirReader.prototype.destroy = function () {
    this.options = null;
    this.filecount = null;
    FileReader.prototype.destroy.call(this);
  };
  DirReader.prototype.go = function () {
    if(this.parserInfo.needed && this.options.filecontents.modulename !== '*') {
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
      this.result = 0;
      if (list.length) {
        this.filecount = list.length;
        this.processFileList(list);
      } else {
        this.destroy();
      }
    }
  };
  DirReader.prototype.processFileList = function (filelist) {
    var filename;
    if (filelist.length) {
      filename = filelist.pop();
      this.processFileName(filename).done(
        this.processSuccess.bind(this,filelist,filename),
        this.fail.bind(this)
      );
    }
  };
  DirReader.prototype.processSuccess = function (filelist, filename, result) {
    console.log('processSuccess', filename, result);
    if (result) {
      this.oneDone();
    } else {
      this.oneFailed();
    }
    this.processFileList(filelist);
  };
  DirReader.prototype.checkDone = function () {
    if(this.filecount===this.result){
      this.destroy();
    };
  };
  DirReader.prototype.oneDone = function () {
    this.result ++;
    this.checkDone();
  };
  DirReader.prototype.oneFailed = function () {
    this.filecount --;
    this.checkDone();
  };
  DirReader.prototype.processFileName = function (filename) {
    var d = q.defer(), rd, metareader;
    if (this.options.files && this.options.files.indexOf(filename) < 0) {
      d.resolve(false);
      return d.promise;
    }
    if (this.parserInfo.needed && this.options.filecontents.modulename === '*') {
      rd = q.defer();
      metareader = readerFactory(Path.join('.meta', filename), Path.join(this.path, '.meta', filename), {modulename: 'allex_jsonparser'}, rd);
      rd.promise.done(
        this.onMeta.bind(this,d,filename),
        this.oneFailed.bind(this)
      );
      metareader.go();
    } else {
      this.checkFStats(d, filename);
    }
    return d.promise;
  };
  DirReader.prototype.onMeta = function (defer, filename, meta) {
    if (!(meta && meta.parserinfo)) {
      defer.resolve(false);
      return;
    }
    console.log(filename, 'meta.parserinfo', meta.parserinfo);
    execlib.execSuite.parserRegistry.spawn(meta.parserinfo.modulename, meta.parserinfo.prophash).done(
      this.onMetaParser.bind(this, defer, filename),
      defer.resolve.bind(defer,false)
    );
  };
  DirReader.prototype.onMetaParser = function (defer, filename, parser) {
    this.parserInfo.instance = parser;
    this.checkFStats(defer, filename);
  };
  DirReader.prototype.checkFStats = function (defer, filename) {
    if (this.needsFStats()) {
      fs.lstat(Path.join(this.path,filename), this.onFileStats.bind(this,defer,filename));
    } else {
      this.reportFile(filename, {defer:defer});
    }
  };
  DirReader.prototype.needsFStats = function () {
    return this.options.filestats || this.options.filetypes;
  };
  DirReader.prototype.reportFile = function (filename, reportobj) {
    //console.log('reportFile', filename, this.parserInfo);
    if (this.parserInfo.needed) {
      var d = q.defer(),
        parser = readerFactory(filename, Path.join(this.path,filename), {parserinstance:this.parserInfo.instance}, d);
      d.promise.done(
        reportobj.defer.resolve.bind(reportobj.defer,true),
        this.fail.bind(this),
        this.onParsedRecord.bind(this, reportobj.data || {})
      );
      parser.go();
    } else {
      this.notify(reportobj.data || filename);
      reportobj.defer.resolve(true);
    }
  };
  DirReader.prototype.onParsedRecord = function (statsobj, parsedrecord) {
    lib.traverse(statsobj,function(statsitem, statsname){
      parsedrecord[statsname] = statsitem;
    });
    this.notify(parsedrecord);
  };
  DirReader.prototype.onFileStats = function (defer, filename, err, fstats, stats) {
    stats = stats || {};
    if (this.options.filetypes) {
      if (lib.isArray(this.options.filetypes) && this.options.filetypes.indexOf(util.typeFromStats(fstats))<0) {
        defer.resolve(false);
        return;
      }
    }
    this.options.filestats.forEach(this.populateStats.bind(this,filename,fstats,stats));
    this.reportFile(filename,{defer: defer, data: stats});
  };
  DirReader.prototype.populateStats = function (filename, fstats, stats, statskey) {
    var mn = 'extract_'+statskey, 
      m = this[mn];
    if ('function' === typeof m){
      stats[statskey] = m.call(this, filename, fstats);
    }/* else {
      console.log('Method',mn,'does not exist to populate',statskey,'of filestats');
    }*/
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
