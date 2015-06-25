var fs = require('fs');

function createParserMechanics(execlib){
  function ParserMechanics(parser,filepath,defer){
    this.parser = parser;
    this.defer = defer;
    this.buffer = new Buffer(this.parser.recordLength || 0x1000);
    this.fh = null;
    this.parsedEntities = 0;
    fs.open(filepath,'r',this.onOpened.bind(this));
  }
  ParserMechanics.prototype.destroy = function () {
    this.parsedEntities = null;
    if(this.fh){
      fs.closeSync(this.fh);
    }
    this.fh = null;
    this.buffer = null;
    this.defer = null;
    this.parser = null;
  };
  ParserMechanics.prototype.fail = function (reason) {
    this.defer.reject(reason);
    this.destroy();
  };
  ParserMechanics.prototype.success = function() {
    this.defer.resolve(this.parsedEntities);
    this.destroy();
  };
  ParserMechanics.prototype.onOpened = function (err, fh) {
    if(err){
      this.fail(err);
    }else{
      this.fh = fh;
      this.read();
    }
  };
  ParserMechanics.prototype.read = function(){
    if(!this.fh){
      this.fail(new lib.Error('INTERNAL_READ_ERROR','ParserMechanics had to read without a file opened'));
      return;
    }
    fs.read(this.fh,this.buffer,0,this.buffer.length,null,this.onRead.bind(this));
  };
  ParserMechanics.prototype.onRead = function(err,length,buff){
    if(length===0){
      this.success();
      return;
    }
    var e, parsed;
    if(this.parser.recordLength && this.parser.recordLength!==length){
      e = new lib.Error('READ_LENGTH_MISMATCH',this.parser.recordLength+' !== '+length);
      e.expectedLength = this.parser.recordLength;
      e.readLength = length;
      this.fail(e);
      return;
    }
    parsed = this.parser.dataToFile(this.buffer);
    if('object' === typeof parsed && parsed!==null){
      this.defer.notify(parsed);
    }
    this.read();
  };

  return ParserMechanics;
}

module.exports = createParserMechanics;
