function createJobs (lib) {
  'use strict';

  var JobOnDestroyable = lib.qlib.JobOnDestroyable, 
    ret = {};

  function FileJob (service, filename, defer) {
    JobOnDestroyable.call(this, service, defer);
    this.id = lib.uid();
    this.filename = filename;
  }
  lib.inherit(FileJob, JobOnDestroyable);
  FileJob.prototype.destroy = function () {
    if (this.filename && this._destroyableOk()) {
      this.destroyable.liveFiles.remove(this.filename);
    }
    this.filename = null;
    this.id = null;
    JobOnDestroyable.prototype.destroy.call(this);
  };
  FileJob.prototype._destroyableOk = function () {
    if (!JobOnDestroyable.prototype._destroyableOk.call(this)) {
      return false;
    }
    return (this.destroyable.db && this.destroyable.liveFiles);
  };
  FileJob.prototype.bufferFrom = function (thingy) {
    if (!lib.isVal(thingy)) {
      return null;
    }
    if (Buffer.isBuffer(thingy)) {
      return thingy;
    }
    if ('object' === typeof thingy && thingy.type==='Buffer' && lib.isArray(thingy.data)) {
      return Buffer.from(thingy.data);
    }
    return null;
  };
  FileJob.prototype.db = function () {
    if (!this.okToGo()) {
      return null;
    }
    return this.destroyable.db;
  };

  ret.FileJob = FileJob;

  require('./uploadcreator')(lib, ret);

  return ret;
}

module.exports = createJobs;
