var fs = require('fs'),
  Path = require('path');

function createUploadJob (lib, mylib) {
  'use strict';

  var q = lib.q,
    qlib = lib.qlib;
  var FileJob = mylib.FileJob;

  function UploadJob (service, filename, filesize, notransaction, metadata, defer) {
    FileJob.call(this, service, filename, defer);
    this.filesize = filesize;
    this.notransaction = notransaction;
    this.metadata = metadata;
    this.txn = null;
    this.writer = null;
    this.written = 0;
  }
  lib.inherit(UploadJob, FileJob);
  UploadJob.prototype.destroy = function () {
    var filename = this.filename, id = this.id, res = this.defer.promise;
    this.written = null;
    //TODO: destroy writer?
    this.writer = null;
    //TODO: commit txn?
    this.txn = null;
    this.metadata = null;
    this.notransaction = null;
    this.filesize = null;
    FileJob.prototype.destroy.call(this);
  };
  UploadJob.prototype.go = function () {
    var ok = this.okToGo(), db;
    if (!ok.ok) {
      return ok.val;
    }
    db = this.db();
    if (!db) {
      this.reject(new lib.Error('NO_DB', 'There is no DirectoryDB available'));
      return ok.val;
    }
    this.txn = this.notransaction ? db : db.begin(Path.dirname(this.filename));
    if (this.metadata) {
      this.txn.writeFileMeta(this.filename, this.metadata).then(
        this.startWrite.bind(this),
        this.reject.bind(this)
      );
      return ok.val;
    }
    this.startWrite();
    return ok.val;
  };
  UploadJob.prototype.startWrite = function () {
    this.txn.write(this.filename, {}, q.defer()).then(
      this.announceSelf.bind(this),
      this.reject.bind(this)
    );
  };
  UploadJob.prototype.announceSelf = function (writer) {
    this.writer = writer;
    this.notify(this.id);
  };
  UploadJob.prototype.takeChunk = function (chunk) {
    var buff;
    if (!this.okToProceed()) {
      return;
    }
    buff = this.bufferFrom(chunk);
    if (!buff) { 
      return q(false);
    }
    return this.writer.write(buff).then(
      this.onWriteDone.bind(this),
      this.onWriteFail.bind(this)
    );
  };
  UploadJob.prototype.onWriteDone = function (bytes) {
    if (!this.okToProceed()) {
      throw new lib.Error('NOK_TO_PROCEED', 'This instance of '+this.constructor.name+' cannot proceed');
    }
    this.written += bytes;
    return bytes;
  };
  UploadJob.prototype.onWriteFail = function (reason) {
    this.reject(reason);
    throw reason;
  };
  UploadJob.prototype.finish = function () {
    var err;
    if (this.filesize !== this.written) {
      err = new lib.Error('UPLOAD_MISMATCH', this.filesize+','+this.written);
      this.reject(err);
      return q.reject(err);
    }
    if (!this.okToProceed()) {
      return q.reject(new lib.Error('NOK_TO_PROCEED', 'This instance of '+this.constructor.name+' cannot proceed'));
    }
    return this.writer.close().then(this.commit.bind(this));
  };
  UploadJob.prototype.commit = function () {
    var d, ret;
    if (!this.okToProceed()) {
      return q.reject(new lib.Error('NOK_TO_PROCEED', 'This instance of '+this.constructor.name+' cannot proceed'));
    }
    d = q.defer();
    ret = d.promise;
    this.txn.commit(d);
    ret.then(
      this.resolve.bind(this, this.written),
      this.reject.bind(this)
    );
    return ret;
  };

  mylib.UploadJob = UploadJob;
}

module.exports = createUploadJob;
