/** internal
 *  class BundledAsset
 *
 *  `BundledAsset`s are used for files that need to be processed and
 *  concatenated with other assets. Use for `.js` and `.css` files.
 **/

'use strict';


// 3rd-party
var _     = require('underscore');
var async = require('async');


// internal
var prop    = require('../common').prop;
var getter  = require('../common').getter;
var Asset   = require('./asset');


/**
 *  new BundledAsset(environment, logical_path, pathname)
 **/
var BundledAsset = module.exports = function BundledAsset(environment, logical_path, pathname) {
  Asset.call(this, environment, logical_path, pathname);

  prop(this, '__processedAsset__', environment.findAsset(pathname, {bundle: false}));
};


require('util').inherits(BundledAsset, Asset);


/**
 *  BundledAsset#compile(callback) -> Void
 *
 *  Runs asset compilation.
 **/
BundledAsset.prototype.compile = function (callback) {
  var self = this;

  // do not compile again once asset was compiled
  if (this.__source__) {
    callback(null, this);
    return;
  }

  async.series([
    // compile processed asset first
    function (next) {
      self.__processedAsset__.compile(next);
    },

    // process ourselves
    function (next) {
      var Klass, context, processors, options, source = "";

      prop(self, '__requiredAssets__', self.__processedAsset__.__requiredAssets__);

      // gather dependency bodies
      self.toArray().forEach(function (dependency) {
        source += dependency.toString();
      });

      // prepare to build ourself
      Klass       = self.environment.ContextClass;
      context     = new Klass(self.environment, self.logical_path, self.pathname);
      processors  = self.environment.getBundleProcessors(self.contentType);
      options     = {data: source, processors: processors};

      context.evaluate(self.pathname, options, function (err, source) {
        if (err) {
          next(err);
          return;
        }

        self.__source__ = source;

        // update some props
        self.mtime  = _.max(_.pluck(self.toArray(), 'mtime'));
        self.length = source.length;
        self.digest = self.environment.digest.update(source).digest('hex');

        next(err);
      });
    }
  ], function (err) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, self);
  });
};


/**
 *  BundledAsset#body -> String
 *
 *  Get asset's own processed contents. Excludes any of its required
 *  dependencies but does run any processors or engines on the
 *  original file.
 **/
getter(BundledAsset.prototype, 'body', function () {
  return this.__processedAsset__.source;
});


/**
 *  BundledAsset#source -> String
 *
 *  Get asset's processed content with all requried dependencies.
 *
 *
 *  ##### Throws Error
 *
 *  - When called before [[BundledAsset#compile]]
 **/
getter(BundledAsset.prototype, 'source', function () {
  if (!this.__source__) {
    throw new Error("Can't read body. Asset wasn't compiled yet.");
  }

  return this.__source__;
});


/**
 *  BundledAsset#dependencies -> Array
 *
 *  Return an `Array` of `Asset` files that are declared dependencies.
 **/
getter(BundledAsset.prototype, 'dependencies', function () {
  return _.reject(this.toArray(), function (asset) {
    return this.__processedAsset__ === asset;
  }, this);
});


/**
 *  BundledAsset#toArray() -> Array
 *
 *  Return array of porcessed assets this asset contains of.
 *
 *
 *  ##### Throws Error
 *
 *  - When called before [[BundledAsset#compile]]
 **/
BundledAsset.prototype.toArray = function () {
  if (!this.__requiredAssets__) {
    throw new Error("Can't get required assets. Asset wasn't compiled yet.");
  }

  return this.__requiredAssets__;
};


/**
 *  BundledAsset#isFresh() -> Boolean
 *
 *  Checks if Asset is stale by comparing the actual mtime and
 *  digest to the inmemory model.
 **/
BundledAsset.prototype.isFresh = function () {
  return this.__processedAsset__.isFresh(this.environment);
};