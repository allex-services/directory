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
    //console.log('onSizeForFixedChunks', size, recordsize);
    if ((size - headersize - footersize) % recordsize) {
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
        execlib.execSuite.parserRegistry.spawn(this.options.modulename, this.options.propertyhash).done(
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
          this.size().done(this.onSizeForParser.bind(this, parser));
        } else {
          parser.destroy(); //parser used only to read recordDelimiter
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
  ParsedFileReader.prototype.onSizeForParser = function (parser, size) {
    var hrfr = new HRFReader(this, size, parser);
    hrfr.defer.promise.done(
      this.destroy.bind(this),
      this.fail.bind(this)
    );
    (hrfr).go();
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
    try {
      rec = parser.fileToData(record);
      if(lib.defined(rec)){
        this.result++;
        this.notify(rec);
      }
    } catch (e) {
      this.fail(e);
    }
  };
  ParsedFileReader.prototype.onOpenForRawRead = function (start, quantity) {
    //console.log(this.name, 'onOpenForRawRead', start, quantity);
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
    try {
      this.result = parser.fileToData(buff);
    } catch(e) {
      this.fail(e);
    }
  };
  ParsedFileReader.prototype.readVariableLengthRecords = function (parser, offsetobj) {
    var buff = new Buffer(1050);
    //console.log('reading with offset', offsetobj.offset);
    this.read(offsetobj.offset, buff).done(
      this.onBufferReadForVariableLengthRecord.bind(this, parser, buff, offsetobj)
     );
  };
  ParsedFileReader.prototype.onBufferReadForVariableLengthRecord = function (parser, buff, offsetobj, bytesread) {
    //console.log('csv bytes read', bytesread);
    if (!bytesread) {
      parser.destroy();
      this.result = offsetobj.offset;
      this.close();
      return;
    }
    buff = buff.length === bytesread ? buff : buff.slice(0, bytesread);
    try {
      var records = parser.fileToData(buff);
      //console.log('records', records);
      //console.log(records.length, 'records');
      records.forEach(this.notify.bind(this));
      offsetobj.offset+=bytesread;
      this.readVariableLengthRecords(parser, offsetobj);
    } catch (e) {
      this.fail(e);
    }
  };

  function HRFReader(filereader, filesize, parser) {
    lib.AsyncJob.call(this);
    this.reader = filereader;
    this.parser = parser;
    this.filesize = filesize;
    this.header = parser.headerLength ? new Buffer(parser.headerLength) : null;
    this.record = parser.recordDelimiter ? new Buffer(parser.recordDelimiter) : null;
    this.footer = parser.footerLength ? new Buffer(parser.footerLength) : null;
    this.recordstoread = ~~((this.filesize - this.headerLength() - this.footerLength()) / this.parser.recordDelimiter);
    //console.log(this.reader.name, 'recordstoread', this.recordstoread);
  }
  lib.inherit(HRFReader, lib.AsyncJob);
  HRFReader.prototype.destroy = function () {
    this.parser.destroy();
    this.recordstoread = null;
    this.footer = null;
    this.record = null;
    this.header = null;
    this.filesize = null;
    this.parser = null;
    this.reader = null;
    lib.AsyncJob.prototype.destroy.call(this);
  };
  HRFReader.prototype.proc = function () {
    if (!this.sizesOK()) {
      console.error(this.reader.name+' is of size '+this.filesize+' record of size '+this.parser.recordDelimiter+' cannot fit');
      this.fail(new lib.Error('RECORD_SIZE_MISMATCH',this.name+' is of size '+this.size+' record of size '+this.parser.recordDelimiter+' cannot fit'));
      return;
    }
    this.reader.openDefer.promise.done(
      this.read.bind(this),
      this.fail.bind(this)
    );
    this.reader.open();
  }
  HRFReader.prototype.headerLength = function () {
    return this.parser.headerLength || 0;
  };
  HRFReader.prototype.footerLength = function () {
    return this.parser.footerLength || 0;
  };
  HRFReader.prototype.sizesOK = function () {
    return ((this.filesize - (this.headerLength()) - (this.footerLength())) % this.parser.recordDelimiter) === 0;
  };
  HRFReader.prototype.read = function () {
    var buff;
    if (this.header) {
      buff = this.header;
    } else if (this.record){
      buff = this.record;
    } else if (this.footer){
      buff = this.footer;
    }
    if (!buff) {
      this.destroy();
    } else {
      fs.read(this.reader.fh, buff, 0, buff.length, null, this.onRead.bind(this));
    }
  };
  HRFReader.prototype.onRead = function (err, bytesread, buffer) {
    if (buffer === this.header) {
      this.header = null;
      this.parser.onHeader(buffer);
      //set this.record to new Buffer(this.parser.recordDelimiter)
    } else if (buffer === this.record) {
      this.recordstoread --;
      if (this.recordstoread < 1) {
        this.record = null;
      }
      this.onRecord(buffer);
      if (!this.record) {
        this.finalize();
      }
    } else if (buffer === this.footer) {
      this.footer = null;
      this.parser.onFooter(buffer);
    }
    this.read();
  };
  HRFReader.prototype.onRecord = function (record) {
    var rec;
    //console.log('onRecord', record);
    if (!record) {
      this.finalize();
      this.reader.close();
      this.destroy();
      return;
    }
    try {
      rec = this.parser.fileToData(record);
      if(lib.defined(rec)){
        this.reader.result++;
        this.reader.notify(rec);
      }
    } catch (e) {
      //console.log('ERROR in parsing record',record,':',e);
      this.reader.fail(e);
    }
  };
  HRFReader.prototype.finalize = function () {
    var rec = this.parser.finalize();
    if (lib.defined(rec)) {
      this.reader.result++;
      this.reader.notify(rec);
    }
  };

  /*
   * options: {
   *   filecontents: { //options
   *     modulename: '*' or a real parser modulename,
   *     parsers: {
   *       modulename: modulepropertyhash for spawning
   *     }
   *   },
   *   filestats: ['filebasename', 'filename', 'fileext', 'filetype', 'created', 'lastmodified'],
   *   metastats: [stringorfetcher],
   *   files: ['filename1', ..., 'filenameN'], //whitelist
   *   filetypes: ['f', 'd'], //whitelist
   * }
   */
  function DirReader(name, path, options, defer) {
    FileReader.call(this, name, path, defer);
    this.filecount = 0;
    this.options = options;
    this.parserInfo = {
      waiting: false,
      instance: null
    };
    if (this.options.filecontents) {
      if (this.options.filecontents.modulename) {
        if (this.options.filecontents.modulename !== '*') {
          execlib.execSuite.parserRegistry.spawn(this.options.filecontents.modulename, this.options.filecontents.propertyhash).done(
            this.onParserInstantiated.bind(this),
            this.fail.bind(this)
          );
        }
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
    //console.log('going for', this.path, 'with current parserInfo', this.parserInfo, 'and options', this.options);
    if(this.options.needparsing && this.options.filecontents.modulename !== '*') {
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
    //console.log('parser instantiated', parser, 'current parserInfo', this.parserInfo);
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
    //console.log(this.name,'oneDone');
    this.result ++;
    this.checkDone();
  };
  DirReader.prototype.oneFailed = function () {
    //console.log(this.name,'oneFailed');
    this.filecount --;
    this.checkDone();
  };
  DirReader.prototype.processFileName = function (filename) {
    var d = q.defer(), rd, metareader;
    if (this.options.files && this.options.files.indexOf(filename) < 0) {
      d.resolve(false);
      return d.promise;
    }
    //console.log(this.name, 'deciding wether to read .meta, this.parserInfo', this.parserInfo, 'this.options', this.options);
    if (this.needMeta()) {
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
  DirReader.prototype.needParsing = function () {
    return this.options.needparsing && 
      (
        this.options.filecontents.modulename === '*' ||
        this.options.filecontents.parsers
      );
  };
  DirReader.prototype.needMeta = function () {
    //console.log('needMeta?', this.options);
    return this.options.metastats || this.needParsing();
  };
  function modulefinder(findobj, moduleitem) {
    if(findobj.modulename === moduleitem.modulename){
      findobj.found = moduleitem;
      return true;
    }
  }
  function fillMetaInfo(metainfo, metaresult, metaname){
    if (lib.isString(metaname)) {
      metaresult[metaname] = metainfo[metaname];
    } else {
      metaresult[metaname.dest] = lib.readPropertyFromDotDelimitedString(metainfo, metaname.src);
    }
  }
  DirReader.prototype.onMeta = function (defer, filename, meta) {
    //console.log(this.name, 'onMeta', filename, meta, require('util').inspect(this.options, {depth:null}));
    if (!(meta && meta.parserinfo)) {
      defer.resolve(false);
      return;
    }
    if (this.options.filecontents && this.options.filecontents.parsers) {
      //console.log('looking for', meta.parserinfo.modulename, 'in', this.options.filecontents.parsers);
      var parserfound = this.options.filecontents.parsers[meta.parserinfo.modulename];
      //console.log('found', parserfound);
      if (!parserfound) {
        defer.resolve(false);
        return;
      }
      //console.log('found', parserfound);
      meta.parserinfo.propertyhash = lib.extend({}, meta.parserinfo.propertyhash, parserfound.propertyhash);
    }
    if (this.needParsing()) {
      //console.log(filename, 'meta.parserinfo', meta.parserinfo, 'this.options.filecontents', this.options.filecontents);
      execlib.execSuite.parserRegistry.spawn(meta.parserinfo.modulename, meta.parserinfo.propertyhash).done(
        this.onMetaParser.bind(this, defer, filename),
        defer.resolve.bind(defer,false)
      );
    } else {
      var metainfo = {};
      this.options.metastats.forEach(fillMetaInfo.bind(null, meta, metainfo));
      this.options.metainfo = metainfo;
      this.checkFStats(defer, filename);
    }
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
    if (this.options.needparsing) {
      var d = q.defer(),
        parser = readerFactory(filename, Path.join(this.path,filename), {parserinstance:this.parserInfo.instance}, d);
      d.promise.done(
        //reportobj.defer.resolve.bind(reportobj.defer,true),
        this.onParsedFile.bind(this, reportobj),
        this.fail.bind(this),
        this.onParsedRecord.bind(this, reportobj.data || {})
      );
      parser.go();
    } else {
      var data = lib.extend(reportobj.data, this.options.metainfo);
      //console.log(filename, '=>', data);
      this.notify(data || filename);
      reportobj.defer.resolve(true);
    }
  };
  DirReader.prototype.onParsedFile = function (reportobj) {
    this.parserInfo.instance.destroy();
    this.parserInfo.instance = null;
    reportobj.defer.resolve(true);
  };
  DirReader.prototype.onParsedRecord = function (statsobj, parsedrecord) {
    //console.log('notifying', parsedrecord);
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
