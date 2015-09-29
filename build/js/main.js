require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * public api for cartodb
 */
(function() {
  function _Promise() {

  }
  _.extend(_Promise.prototype,  Backbone.Events, {
    done: function(fn) {
      return this.bind('done', fn);
    },
    error: function(fn) {
      return this.bind('error', fn);
    }
  });

  cdb._Promise = _Promise;

  var _requestCache = {};

  /**
   * compose cartodb url
   */
  function cartodbUrl(opts) {
    var host = opts.host || 'cartodb.com';
    var protocol = opts.protocol || 'https';
    return protocol + '://' + opts.user + '.' + host + '/api/v1/viz/' + opts.table + '/viz.json';
  }

  /**
   * given layer params fetchs the layer json
   */
  function _getLayerJson(layer, callback) {
    var url = null;
    if(layer.layers !== undefined || ((layer.kind || layer.type) !== undefined)) {
      // layer object contains the layer data
      _.defer(function() { callback(layer); });
      return;
    } else if(layer.table !== undefined && layer.user !== undefined) {
      // layer object points to cartodbjson
      url = cartodbUrl(layer);
    } else if(layer.indexOf) {
      // fetch from url
      url = layer;
    }
    if(url) {
      cdb.core.Loader.get(url, callback);
    } else {
      _.defer(function() { callback(null); });
    }
  }

  /**
   * create a layer for the specified map
   *
   * @param map should be a L.Map object, or equivalent depending on what provider you have.
   * @param layer should be an url or a javascript object with the data to create the layer
   * @param options layer options
   *
   */
  cartodb.createLayer = function(map, layer, options, callback) {
    if(map === undefined) {
      throw new TypeError("map should be provided");
    }
    if(layer === undefined) {
      throw new TypeError("layer should be provided");
    }

    var layerView, MapType;
    var options = options || {};
    var args = arguments;
    var fn = args[args.length -1];
    if(_.isFunction(fn)) {
      callback = fn;
    }
    var promise = new _Promise();

    promise.addTo = function(map, position) {
      promise.on('done', function() {
        MapType.addLayerToMap(layerView, map, position);
      });
      return promise;
    };

    _getLayerJson(layer, function(visData) {

      var layerData;

      if(!visData) {
        promise.trigger('error');
        return;
      }

      // extract layer data from visualization data
      if(visData.layers) {
        if(visData.layers.length < 2) {
          promise.trigger('error', "visualization file does not contain layer info");
        }
        var index = options.layerIndex;
        if (index !== undefined) {
          if(visData.layers.length <= index) {
            promise.trigger('error', 'layerIndex out of bounds');
            return;
          }
          layerData = visData.layers[index];
        } else {
          var DATA_LAYER_TYPES = ['namedmap', 'layergroup', 'torque'];

          // Select the first data layer (namedmap or layergroup)
          layerData = _.find(visData.layers, function(layer){
            return DATA_LAYER_TYPES.indexOf(layer.type) !== -1;
          });
        }
      } else {
        layerData = visData;
      }

      if(!layerData) {
        promise.trigger('error');
        return;
      }

      // update options
      if(options && !_.isFunction(options)) {
        layerData.options = layerData.options || {};
        _.extend(layerData.options, options);
      }

      options = _.defaults(options, {
        infowindow: true,
        https: false,
        legends: true,
        time_slider: true,
        tooltip: true
      });

      // check map type
      // TODO: improve checking
      if(typeof(map.overlayMapTypes) !== "undefined") {
        MapType = cdb.geo.GoogleMapsMapView;
        // check if leaflet is loaded globally
      } else if(map instanceof L.Map || (window.L && map instanceof window.L.Map)) {
        MapType = cdb.geo.LeafletMapView;
      } else {
        promise.trigger('error', "cartodb.js can't guess the map type");
        return promise;
      }

      // create a dummy viz
      var viz = map.viz;
      if(!viz) {
        var mapView = new MapType({
          map_object: map,
          map: new cdb.geo.Map()
        });

        map.viz = viz = new cdb.vis.Vis({
          mapView: mapView
        });

        viz.updated_at = visData.updated_at;
        viz.https = options.https;
      }

      function createLayer() {
        layerView = viz.createLayer(layerData, { no_base_layer: true });

        var torqueLayer;
        var mobileEnabled = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        var addMobileLayout = (options.mobile_layout && mobileEnabled) || options.force_mobile;

        if(!layerView) {
          promise.trigger('error', "layer not supported");
          return promise;
        }

        if(options.infowindow) {
          viz.addInfowindow(layerView);
        }

        if(options.tooltip) {
          viz.addTooltip(layerView);
        }

        if(options.legends) {
          var layerModel = cdb.vis.Layers.create(layerData.type || layerData.kind, viz, layerData);

          viz._addLegends(viz._createLayerLegendView(layerModel.attributes,  layerView))
        }

        if(options.time_slider && layerView.model.get('type') === 'torque') {

          if (!addMobileLayout) { // don't add the overlay if we are in mobile
            viz.addTimeSlider(layerView);
          }

          torqueLayer = layerView;
        }

        if (addMobileLayout) {

          options.mapView = map.viz.mapView;

          viz.addOverlay({
            type: 'mobile',
            layerView: layerView,
            overlays: [],
            torqueLayer: torqueLayer,
            options: options
          });
        }

        callback && callback(layerView);
        promise.trigger('done', layerView);
      }

      // load needed modules
      if(!viz.checkModules([layerData])) {
        viz.loadModules([layerData], function() {
          createLayer();
        });
      } else {
        createLayer();
      }
    });

    return promise;
  };
})();

},{}],2:[function(require,module,exports){

;(function() {

  var root = this;

  root.cartodb = root.cartodb || {};

  function SQL(options) {
    if(cartodb === this || window === this) {
      return new SQL(options);
    }
    if(!options.user) {
      throw new Error("user should be provided");
    }
    var loc = new String(window.location.protocol);
    loc = loc.slice(0, loc.length - 1);
    if(loc == 'file') {
      loc = 'https';
    }

    this.ajax = options.ajax || (typeof(jQuery) !== 'undefined' ? jQuery.ajax: reqwest);
    if(!this.ajax) {
      throw new Error("jQuery or reqwest should be loaded");
    }

    this.options = _.defaults(options, {
      version: 'v2',
      protocol: loc,
      jsonp: typeof(jQuery) !== 'undefined' ? !jQuery.support.cors: false
    })

    if (!this.options.sql_api_template) {
      var opts = this.options;
      var template = null;
      if(opts && opts.completeDomain) {
        template = opts.completeDomain;
      } else {
        var host = opts.host || 'cartodb.com';
        var protocol = opts.protocol || 'https';
        template = protocol + '://{user}.' + host;
      }
      this.options.sql_api_template = template;
    }
  }

  SQL.prototype._host = function() {
    var opts = this.options;
    return opts.sql_api_template.replace('{user}', opts.user) + '/api/' +  opts.version + '/sql';
  },

  /**
   * var sql = new SQL('cartodb_username');
   * sql.execute("select * form {table} where id = {id}", {
   *    table: 'test',
   *    id: '1'
   * })
   */
  SQL.prototype.execute = function(sql, vars, options, callback) {

    //Variable that defines if a query should be using get method or post method
    var MAX_LENGTH_GET_QUERY = 1024;

    var promise = new cartodb._Promise();
    if(!sql) {
      throw new TypeError("sql should not be null");
    }
    // setup arguments
    var args = arguments,
    fn = args[args.length -1];
    if(_.isFunction(fn)) {
      callback = fn;
    }
    options = _.defaults(options || {}, this.options);
    var params = {
      type: 'get',
      dataType: 'json',
      crossDomain: true
    };

    if(options.cache !== undefined) {
      params.cache = options.cache; 
    }

    if(options.jsonp) {
      delete params.crossDomain;
      if (options.jsonpCallback) {
        params.jsonpCallback = options.jsonpCallback;
      }
      params.dataType = 'jsonp';
    }

    // Substitute mapnik tokens
    // resolution at zoom level 0
    var res = '156543.03515625';
    // full webmercator extent
    var ext = 'ST_MakeEnvelope(-20037508.5,-20037508.5,20037508.5,20037508.5,3857)';
    sql = sql.replace('!bbox!', ext)
             .replace('!pixel_width!', res)
             .replace('!pixel_height!', res);

    // create query
    var query = Mustache.render(sql, vars);

    // check method: if we are going to send by get or by post
    var isGetRequest = query.length < MAX_LENGTH_GET_QUERY;

    // generate url depending on the http method
    var reqParams = ['format', 'dp', 'api_key'];
    // request params
    if (options.extra_params) {
      reqParams = reqParams.concat(options.extra_params);
    }

    params.url = this._host() ;
    if (isGetRequest) {
      var q = 'q=' + encodeURIComponent(query);
      for(var i in reqParams) {
        var r = reqParams[i];
        var v = options[r];
        if(v) {
          q += '&' + r + "=" + v;
        }
      }

      params.url += '?' + q;
    } else {
      var objPost = {'q': query};
      for(var i in reqParams) {
        var r = reqParams[i];
        var v = options[r];
        if (v) {
          objPost[r] = v;
        }
      }

      params.data = objPost;
      //Check if we are using jQuery(uncompressed) or reqwest (core)
      if ((typeof(jQuery) !== 'undefined')) {
        params.type = 'post';
      } else {
        params.method = 'post'; 
      }
    }

    // wrap success and error functions
    var success = options.success;
    var error = options.error;
    if(success) delete options.success;
    if(error) delete error.success;

    params.error = function(resp) {
      var res = resp.responseText || resp.response;
      var errors = res && JSON.parse(res);
      promise.trigger('error', errors && errors.error, resp)
      if(error) error(resp);
    }
    params.success = function(resp, status, xhr) {
      // manage rewest
      if(status == undefined) {
        status = resp.status;
        xhr = resp;
        resp = JSON.parse(resp.response);
      }
      //Timeout explanation. CartoDB.js ticket #336
      //From St.Ov.: "what setTimeout does is add a new event to the browser event queue 
      //and the rendering engine is already in that queue (not entirely true, but close enough) 
      //so it gets executed before the setTimeout event."
      setTimeout(function() {
        promise.trigger('done', resp, status, xhr);
        if(success) success(resp, status, xhr);
        if(callback) callback(resp);
      }, 0);
    }

    // call ajax
    delete options.jsonp;
    this.ajax(_.extend(params, options));
    return promise;
  }

  SQL.prototype.getBounds = function(sql, vars, options, callback) {
      var promise = new cartodb._Promise();
      var args = arguments,
      fn = args[args.length -1];
      if(_.isFunction(fn)) {
        callback = fn;
      }
      var s = 'SELECT ST_XMin(ST_Extent(the_geom)) as minx,' +
              '       ST_YMin(ST_Extent(the_geom)) as miny,'+
              '       ST_XMax(ST_Extent(the_geom)) as maxx,' +
              '       ST_YMax(ST_Extent(the_geom)) as maxy' +
              ' from ({{{ sql }}}) as subq';
      sql = Mustache.render(sql, vars);
      this.execute(s, { sql: sql }, options)
        .done(function(result) {
          if (result.rows && result.rows.length > 0 && result.rows[0].maxx != null) {
            var c = result.rows[0];
            var minlat = -85.0511;
            var maxlat =  85.0511;
            var minlon = -179;
            var maxlon =  179;

            var clamp = function(x, min, max) {
              return x < min ? min : x > max ? max : x;
            }

            var lon0 = clamp(c.maxx, minlon, maxlon);
            var lon1 = clamp(c.minx, minlon, maxlon);
            var lat0 = clamp(c.maxy, minlat, maxlat);
            var lat1 = clamp(c.miny, minlat, maxlat);

            var bounds = [[lat0, lon0], [lat1, lon1]];
            promise.trigger('done', bounds);
            callback && callback(bounds);
          }
        })
        .error(function(err) {
          promise.trigger('error', err);
        })

      return promise;

  }

  /**
   * var people_under_10 = sql
   *    .table('test')
   *    .columns(['age', 'column2'])
   *    .filter('age < 10')
   *    .limit(15)
   *    .order_by('age')
   *
   *  people_under_10(function(results) {
   *  })
   */

  SQL.prototype.table = function(name) {

    var _name = name;
    var _filters;
    var _columns = [];
    var _limit;
    var _order;
    var _orderDir;
    var _sql = this;

    function _table() {
      _table.fetch.apply(_table, arguments);
    }

    _table.fetch = function(vars) {
      vars = vars || {}
      var args = arguments,
      fn = args[args.length -1];
      if(_.isFunction(fn)) {
        callback = fn;
        if(args.length === 1) vars = {};
      }
      _sql.execute(_table.sql(), vars, callback);
    }

    _table.sql = function() {
      var s = "select"
      if(_columns.length) {
        s += ' ' + _columns.join(',') + ' '
      } else {
        s += ' * '
      }

      s += "from " + _name;

      if(_filters) {
        s += " where " + _filters;
      }
      if(_limit) {
        s += " limit " + _limit;
      }
      if(_order) {
        s += " order by " + _order;
      }
      if(_orderDir) {
        s += ' ' + _orderDir;
      }

      return s;
    }

    _table.filter = function(f) {
      _filters = f;
      return _table;
    }

    _table.order_by= function(o) {
      _order = o;
      return _table;
    }
    _table.asc = function() {
      _orderDir = 'asc'
      return _table;
    }

    _table.desc = function() {
      _orderDir = 'desc'
      return _table;
    }

    _table.columns = function(c) {
      _columns = c;
      return _table;
    }

    _table.limit = function(l) {
      _limit = l;
      return _table;
    }

    return _table;

  }


  /*
   * sql.filter(sql.f().distance('< 10km')
   */
  /*cartodb.SQL.geoFilter = function() {
    var _sql;
    function f() {}

    f.distance = function(qty) {
      qty.replace('km', '*1000')
      _sql += 'st_distance(the_geom) ' + qty
    }
    f.or = function() {
    }

    f.and = function() {
    }
    return f;
  }
  */
  function array_agg(s) {
    return JSON.parse(s.replace(/^{/, '[').replace(/}$/,']'));
  }


  SQL.prototype.describeString = function(sql, column, callback) {

      var s = [
        'WITH t as (',
        '        SELECT count(*) as total,',
        '               count(DISTINCT {{column}}) as ndist',
        '        FROM ({{sql}}) _wrap',
        '      ), a as (',
        '        SELECT ',
        '          count(*) cnt, ',
        '          {{column}}',
        '        FROM ',
        '          ({{sql}}) _wrap ',
        '        GROUP BY ',
        '          {{column}} ',
        '        ORDER BY ',
        '          cnt DESC',
        '        ), b As (',
        '         SELECT',
        '          row_number() OVER (ORDER BY cnt DESC) rn,',
        '          cnt',
        '         FROM a',
        '        ), c As (',
        '        SELECT ',
        '          sum(cnt) OVER (ORDER BY rn ASC) / t.total cumperc,',
        '          rn,',
        '          cnt ',
        '         FROM b, t',
        '         LIMIT 10',
        '         ),',
        'stats as (', 
           'select count(distinct({{column}})) as uniq, ',
           '       count(*) as cnt, ',
           '       sum(case when COALESCE(NULLIF({{column}},\'\')) is null then 1 else 0 end)::numeric as null_count, ',
           '       sum(case when COALESCE(NULLIF({{column}},\'\')) is null then 1 else 0 end)::numeric / count(*)::numeric as null_ratio, ',
           // '       CDB_DistinctMeasure(array_agg({{column}}::text)) as cat_weight ',
           '       (SELECT max(cumperc) weight FROM c) As skew ',
           'from ({{sql}}) __wrap',
        '),',
        'hist as (', 
           'select array_agg(row(d, c)) array_agg from (select distinct({{column}}) d, count(*) as c from ({{sql}}) __wrap, stats group by 1 limit 100) _a',
        ')',
        'select * from stats, hist'
      ];

      var query = Mustache.render(s.join('\n'), {
        column: column, 
        sql: sql
      });

      var normalizeName = function(str) {
        var normalizedStr = str.replace(/^"(.+(?="$))?"$/, '$1'); // removes surrounding quotes
        return normalizedStr.replace(/""/g, '"'); // removes duplicated quotes
      }

      this.execute(query, function(data) {
        var row = data.rows[0];
        var weight = 0;
        var histogram = [];

        try {
          var s = array_agg(row.array_agg);

          var histogram = _(s).map(function(row) {
              var r = row.match(/\((.*),(\d+)/);
              var name = normalizeName(r[1]);
              return [name, +r[2]];
          });

          weight = row.skew * (1 - row.null_ratio) * (1 - row.uniq / row.cnt) * ( row.uniq > 1 ? 1 : 0);
        } catch(e) {

        }

        callback({
          type: 'string',
          hist: histogram,
          distinct: row.uniq,
          count: row.cnt,
          null_count: row.null_count,
          null_ratio: row.null_ratio,
          skew: row.skew,
          weight: weight
        });
      });
  }

  SQL.prototype.describeDate = function(sql, column, callback) {
    var s = [
      'with minimum as (',
        'SELECT min({{column}}) as start_time FROM ({{sql}}) _wrap), ',
      'maximum as (SELECT max({{column}}) as end_time FROM ({{sql}}) _wrap), ',
      'null_ratio as (SELECT sum(case when {{column}} is null then 1 else 0 end)::numeric / count(*)::numeric as null_ratio FROM ({{sql}}) _wrap), ',
      'moments as (SELECT count(DISTINCT {{column}}) as moments FROM ({{sql}}) _wrap)',
      'SELECT * FROM minimum, maximum, moments, null_ratio'
    ];
    var query = Mustache.render(s.join('\n'), {
      column: column,
      sql: sql
    });

    this.execute(query, function(data) {
      var row = data.rows[0];
      var e = new Date(row.end_time);
      var s = new Date(row.start_time);

      var moments = row.moments;

      var steps = Math.min(row.moments, 1024);
      
      callback({
        type: 'date',
        start_time: s,
        end_time: e,
        range: e - s,
        steps: steps,
        null_ratio: row.null_ratio
      });
    });
  }

  SQL.prototype.describeBoolean = function(sql, column, callback){
    var s = [
      'with stats as (',
            'select count(distinct({{column}})) as uniq,',
                   'count(*) as cnt',
              'from ({{sql}}) _wrap ',
        '),',
      'null_ratio as (',
        'SELECT sum(case when {{column}} is null then 1 else 0 end)::numeric / count(*)::numeric as null_ratio FROM ({{sql}}) _wrap), ',
      'true_ratio as (',
        'SELECT sum(case when {{column}} is true then 1 else 0 end)::numeric / count(*)::numeric as true_ratio FROM ({{sql}}) _wrap) ',
      'SELECT * FROM true_ratio, null_ratio, stats'
    ];
    var query = Mustache.render(s.join('\n'), {
      column: column,
      sql: sql
    });

    this.execute(query, function(data) {
      var row = data.rows[0];
      
      callback({
        type: 'boolean',
        null_ratio: row.null_ratio,
        true_ratio: row.true_ratio,
        distinct: row.uniq,
        count: row.cnt
      });
    });
  }

  SQL.prototype.describeGeom = function(sql, column, callback) {
      var s = [
        'with stats as (', 
           'select st_asgeojson(st_extent({{column}})) as bbox',
           'from ({{sql}}) _wrap',
        '),',
        'geotype as (', 
          'select st_geometrytype({{column}}) as geometry_type from ({{sql}}) _w where {{column}} is not null limit 1',
        '),',
        'clusters as (', 
          'with clus as (',
            'SELECT distinct(ST_snaptogrid(the_geom, 10)) as cluster, count(*) as clustercount FROM ({{sql}}) _wrap group by 1 order by 2 desc limit 3),', 
          'total as (',
            'SELECT count(*) FROM ({{sql}}) _wrap)',
          'SELECT sum(clus.clustercount)/sum(total.count) AS clusterrate FROM clus, total',
        '),',
        'density as (',
          'SELECT count(*) / st_area(st_extent(the_geom)) as density FROM ({{sql}}) _wrap',
        ')',
        'select * from stats, geotype, clusters, density'
      ];

      var query = Mustache.render(s.join('\n'), {
        column: column, 
        sql: sql
      });
      function simplifyType(g) {
        return { 
        'st_multipolygon': 'polygon',
        'st_polygon': 'polygon',
        'st_multilinestring': 'line',
        'st_linestring': 'line',
        'st_multipoint': 'point',
        'st_point': 'point'
        }[g.toLowerCase()]
      };

      this.execute(query, function(data) {
        var row = data.rows[0];
        var bbox = JSON.parse(row.bbox).coordinates[0]
        callback({
          type: 'geom',
          //lon,lat -> lat, lon
          bbox: [[bbox[0][0],bbox[0][1]], [bbox[2][0], bbox[2][1]]],
          geometry_type: row.geometry_type,
          simplified_geometry_type: simplifyType(row.geometry_type),
          cluster_rate: row.clusterrate,
          density: row.density
        });
      });
  }

  SQL.prototype.columns = function(sql, options, callback) {
    var args = arguments,
        fn = args[args.length -1];
    if(_.isFunction(fn)) {
      callback = fn;
    }
    var s = "select * from (" + sql + ") __wrap limit 0";
    var exclude = ['cartodb_id','latitude','longitude','created_at','updated_at','lat','lon','the_geom_webmercator'];
    this.execute(s, function(data) {
      var t = {}
      for (var i in data.fields) {
        if (exclude.indexOf(i) === -1) {
          t[i] = data.fields[i].type;
        }
      }
      callback(t);
    });
  };

  SQL.prototype.describeFloat = function(sql, column, callback) {
      var s = [
        'with stats as (',
            'select min({{column}}) as min,',
                   'max({{column}}) as max,',
                   'avg({{column}}) as avg,',
                   'count(DISTINCT {{column}}) as cnt,',
                   'count(distinct({{column}})) as uniq,',
                   'count(*) as cnt,',
                   'sum(case when {{column}} is null then 1 else 0 end)::numeric / count(*)::numeric as null_ratio,',
                   'stddev_pop({{column}}) / count({{column}}) as stddev,',
                   'CASE WHEN abs(avg({{column}})) > 1e-7 THEN stddev({{column}}) / abs(avg({{column}})) ELSE 1e12 END as stddevmean,',
                    'CDB_DistType(array_agg("{{column}}"::numeric)) as dist_type ',
              'from ({{sql}}) _wrap ',
        '),',
        'params as (select min(a) as min, (max(a) - min(a)) / 7 as diff from ( select {{column}} as a from ({{sql}}) _table_sql where {{column}} is not null ) as foo ),',
        'histogram as (',
           'select array_agg(row(bucket, range, freq)) as hist from (',
           'select CASE WHEN uniq > 1 then width_bucket({{column}}, min-0.01*abs(min), max+0.01*abs(max), 100) ELSE 1 END as bucket,',
                  'numrange(min({{column}})::numeric, max({{column}})::numeric) as range,',
                  'count(*) as freq',
             'from ({{sql}}) _w, stats',
             'group by 1',
             'order by 1',
          ') __wrap',
         '),',
        'hist as (', 
           'select array_agg(row(d, c)) cat_hist from (select distinct({{column}}) d, count(*) as c from ({{sql}}) __wrap, stats group by 1 limit 100) _a',
        '),',
         'buckets as (',
            'select CDB_QuantileBins(array_agg(distinct({{column}}::numeric)), 7) as quantiles, ',
            '       (select array_agg(x::numeric) FROM (SELECT (min + n * diff)::numeric as x FROM generate_series(1,7) n, params) p) as equalint,',
            // '       CDB_EqualIntervalBins(array_agg({{column}}::numeric), 7) as equalint, ',
            '       CDB_JenksBins(array_agg(distinct({{column}}::numeric)), 7) as jenks, ',
            '       CDB_HeadsTailsBins(array_agg(distinct({{column}}::numeric)), 7) as headtails ',
            'from ({{sql}}) _table_sql where {{column}} is not null',
         ')',
         'select * from histogram, stats, buckets, hist'
      ];

      var query = Mustache.render(s.join('\n'), {
        column: column, 
        sql: sql
      });

      this.execute(query, function(data) {
        var row = data.rows[0];
        var s = array_agg(row.hist);
        var h = array_agg(row.cat_hist);
        callback({
          type: 'number',
          cat_hist: 
            _(h).map(function(row) {
            var r = row.match(/\((.*),(\d+)/);
            return [+r[1], +r[2]];
          }),
          hist: _(s).map(function(row) {
            if(row.indexOf("empty") > -1) return;
            var els = row.split('"');
            return { index: els[0].replace(/\D/g,''), 
                     range: els[1].split(",").map(function(d){return d.replace(/\D/g,'')}), 
                     freq: els[2].replace(/\D/g,'') };
          }),
          stddev: row.stddev,
          null_ratio: row.null_ratio,
          count: row.cnt,
          distinct: row.uniq,
          //lstddev: row.lstddev,
          avg: row.avg,
          max: row.max,
          min: row.min,
          stddevmean: row.stddevmean,
          weight: (row.uniq > 1 ? 1 : 0) * (1 - row.null_ratio) * (row.stddev < -1 ? 1 : (row.stddev < 1 ? 0.5 : (row.stddev < 3 ? 0.25 : 0.1))),
          quantiles: row.quantiles,
          equalint: row.equalint,
          jenks: row.jenks,
          headtails: row.headtails,
          dist_type: row.dist_type
        });
      });
  }

  // describe a column
  SQL.prototype.describe = function(sql, column, options) {
      var self = this;
      var args = arguments,
          fn = args[args.length -1];
      if(_.isFunction(fn)) {
        var _callback = fn;
      }
      var callback = function(data) {
        data.column = column;
        _callback(data);
      }
      var s = "select * from (" + sql + ") __wrap limit 0";
      this.execute(s, function(data) {

        var type = (options && options.type) ? options.type : data.fields[column].type;

        if (!type) {
          callback(new Error("column does not exist"));
          return;
        }

        else if (type === 'string') {
          self.describeString(sql, column, callback);
        } else if (type === 'number') {
          self.describeFloat(sql, column, callback);
        } else if (type === 'geometry') {
          self.describeGeom(sql, column, callback);
        } else if (type === 'date') {
          self.describeDate(sql, column, callback);
        } else if (type === 'boolean') {
          self.describeBoolean(sql, column, callback);
        } else {
          callback(new Error("column type is not supported"));
        }
      });
  }

  root.cartodb.SQL = SQL;

})();

},{}],3:[function(require,module,exports){
(function() {

  cartodb.createVis = function(el, vizjson, options, callback) {

    if (!el) {
      throw new TypeError("a DOM element should be provided");
    }

    var
    args = arguments,
    fn   = args[args.length -1];

    if (_.isFunction(fn)) {
      callback = fn;
    }

    el = (typeof el === 'string' ? document.getElementById(el) : el);

    var vis = new cartodb.vis.Vis({ el: el });

    if (vizjson) {

      vis.load(vizjson, options);

      if (callback) {
        vis.done(callback);
      }

    }

    return vis;

  };

})();

},{}],4:[function(require,module,exports){
/**
 * global configuration
 */

(function() {

    Config = Backbone.Model.extend({
        VERSION: 2,

        initialize: function() {
          this.modules = new Backbone.Collection();
          this.modules.bind('add', function(model) {
            this.trigger('moduleLoaded');
            this.trigger('moduleLoaded:' + model.get('name'));
          }, this);
        },

        //error track
        REPORT_ERROR_URL: '/api/v0/error',
        ERROR_TRACK_ENABLED: false,

        /**
         * returns the base url to compose the final url
         * http://user.cartodb.com/
         */
        getSqlApiBaseUrl: function() {
          var url;
          if (this.get('sql_api_template')) {
            url = this.get("sql_api_template").replace('{user}', this.get('user_name'));
          } else {
            url = this.get('sql_api_protocol') + '://' +
              this.get('user_name') + '.' +
              this.get('sql_api_domain') + ':' +
              this.get('sql_api_port');
          }
          return url;
        },

        /**
         * returns the full sql api url, including the api endpoint
         * allos to specify the version
         * http://user.cartodb.com/api/v1/sql
         */
        getSqlApiUrl: function(version) {
          version = version || 'v2';
          return this.getSqlApiBaseUrl() + "/api/" + version + "/sql";
        }


    });

    cdb.config = new Config();
    cdb.config.set({
      cartodb_attributions: "CartoDB <a href='http://cartodb.com/attributions' target='_blank'>attribution</a>",
      cartodb_logo_link: "http://www.cartodb.com"
    });

})();

},{}],5:[function(require,module,exports){
/**
* Decorators to extend funcionality of cdb related objects
*/

/**
* Adds .elder method to call for the same method of the parent class
* usage:
*   insanceOfClass.elder('name_of_the_method');
*/
cdb.decorators.elder = (function() {
  // we need to backup one of the backbone extend models
  // (it doesn't matter which, they are all the same method)
  var backboneExtend = Backbone.Router.extend;
  var superMethod = function(method, options) {
      var result = null;
      if (this.parent != null) {
          var currentParent = this.parent;
          // we need to change the parent of "this", because
          // since we are going to call the elder (super) method
          // in the context of "this", if the super method has
          // another call to elder (super), we need to provide a way of
          // redirecting to the grandparent
          this.parent = this.parent.parent;
          var options = Array.prototype.slice.call(arguments, 1);

          if (currentParent.hasOwnProperty(method)) {
              result = currentParent[method].apply(this, options);
          } else {
              options.splice(0,0, method);
              result = currentParent.elder.apply(this, options);
          }
          this.parent = currentParent;
      }
      return result;
  }
  var extend = function(protoProps, classProps) {
      var child = backboneExtend.call(this, protoProps, classProps);

      child.prototype.parent = this.prototype;
      child.prototype.elder = function(method) {
          var options = Array.prototype.slice.call(arguments, 1);
          if (method) {
              options.splice(0,0, method)
              return superMethod.apply(this, options);
          } else {
              return child.prototype.parent;
          }
      }
      return child;
  };
  var decorate = function(objectToDecorate) {
    objectToDecorate.extend = extend;
    objectToDecorate.prototype.elder = function() {};
    objectToDecorate.prototype.parent = null;
  }
  return decorate;
})()

cdb.decorators.elder(Backbone.Model);
cdb.decorators.elder(Backbone.View);
cdb.decorators.elder(Backbone.Collection);

if(!window.JSON) {
  // shims for ie7
  window.JSON = {
    stringify: function(param) {
      if(typeof param == 'number' || typeof param == 'boolean') {
        return param.toString();
      } else if (typeof param =='string') {
        return '"' + param.toString() + '"';
      } else if(_.isArray(param)) {
        var res = '[';
        for(var n in param) {
          if(n>0) res+=', ';
          res += JSON.stringify(param[n]);
        }
        res += ']'
        return res;
      } else {
        var res = '{';
        for(var p in param) {
          if(param.hasOwnProperty(p)) {
            res += '"'+p+'": '+ JSON.stringify(param[p]);
          }
        }
        res += '}'
        return res;
      }
      // no, we're no gonna stringify regexp, fuckoff.
    },
    parse: function(param) {
      return eval(param);
    }
  }
}

},{}],6:[function(require,module,exports){
var Loader = cdb.vis.Loader = cdb.core.Loader = {

  queue: [],
  current: undefined,
  _script: null,
  head: null,

  loadScript: function(src) {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = src;
      script.async = true;
      if (!Loader.head) {
        Loader.head = document.getElementsByTagName('head')[0];
      }
      // defer the loading because IE9 loads in the same frame the script
      // so Loader._script is null
      setTimeout(function() {
        Loader.head.appendChild(script);
      }, 0);
      return script;
  },

  get: function(url, callback) {
    if (!Loader._script) {
      Loader.current = callback;
      Loader._script = Loader.loadScript(url + (~url.indexOf('?') ? '&' : '?') + 'callback=vizjson');
    } else {
      Loader.queue.push([url, callback]);
    }
  },

  getPath: function(file) {
    var scripts = document.getElementsByTagName('script'),
        cartodbJsRe = /\/?cartodb[\-\._]?([\w\-\._]*)\.js\??/;
    for (i = 0, len = scripts.length; i < len; i++) {
      src = scripts[i].src;
      matches = src.match(cartodbJsRe);

      if (matches) {
        var bits = src.split('/');
        delete bits[bits.length - 1];
        return bits.join('/') + file;
      }
    }
    return null;
  },

  loadModule: function(modName) {
    var file = "cartodb.mod." + modName + (cartodb.DEBUG ? ".uncompressed.js" : ".js");
    var src = this.getPath(file);
    if (!src) {
      cartodb.log.error("can't find cartodb.js file");
    }
    Loader.loadScript(src);
  }
};

window.vizjson = function(data) {
  Loader.current && Loader.current(data);
  // remove script
  Loader.head.removeChild(Loader._script);
  Loader._script = null;
  // next element
  var a = Loader.queue.shift();
  if (a) {
    Loader.get(a[0], a[1]);
  }
};


},{}],7:[function(require,module,exports){
/**
 * logging
 */

(function() {

    // error management
    cdb.core.Error = Backbone.Model.extend({
        url: cdb.config.REPORT_ERROR_URL,
        initialize: function() {
            this.set({browser: JSON.stringify($.browser) });
        }
    });

    cdb.core.ErrorList = Backbone.Collection.extend({
        model: cdb.core.Error,
        enableTrack: function() {
          var old_onerror = window.onerror;
          window.onerror = function(msg, url, line) {
              cdb.errors.create({
                  msg: msg,
                  url: url,
                  line: line
              });
              if (old_onerror)
                old_onerror.apply(window, arguments);
          };
        }
    });

    /** contains all error for the application */
    cdb.errors = new cdb.core.ErrorList();


    // error tracking!
    if(cdb.config.ERROR_TRACK_ENABLED) {
      cdb.errors.enableTrack();
    }


    // logging
    var _fake_console = function() {};
    _fake_console.prototype.error = function(){};
    _fake_console.prototype.log= function(){};

    //IE7 love
    if(typeof console !== "undefined") {
        _console = console;
        try {
          _console.log.apply(_console, ['cartodb.js ' + cartodb.VERSION])
        } catch(e) {
          _console = new _fake_console();
        }
    } else {
        _console = new _fake_console();
    }

    cdb.core.Log = Backbone.Model.extend({

        error: function() {
            _console.error.apply(_console, arguments);
            if(cdb.config.ERROR_TRACK_ENABLED) {
              cdb.errors.create({
                  msg: Array.prototype.slice.call(arguments).join('')
              });
            }
        },

        log: function() {
            _console.log.apply(_console, arguments);
        },

        info: function() {
            _console.log.apply(_console, arguments);
        },

        debug: function() {
          if (cdb.DEBUG) _console.log.apply(_console, arguments);
        }
    });

})();

cdb.log = new cdb.core.Log({tag: 'cdb'});

},{}],8:[function(require,module,exports){
(function() {

  cdb._debugCallbacks= function(o) {
    var callbacks = o._callbacks;
    for(var i in callbacks) {
      var node = callbacks[i];
      console.log(" * ", i);
      var end = node.tail;
      while ((node = node.next) !== end) {
        console.log("    - ", node.context, (node.context && node.context.el) || 'none');
      }
    }
  }

  /**
   * Base Model for all CartoDB model.
   * DO NOT USE Backbone.Model directly
   * @class cdb.core.Model
   */
  var Model = cdb.core.Model = Backbone.Model.extend({

    initialize: function(options) {
      _.bindAll(this, 'fetch',  'save', 'retrigger');
      return Backbone.Model.prototype.initialize.call(this, options);
    },
    /**
    * We are redefining fetch to be able to trigger an event when the ajax call ends, no matter if there's
    * a change in the data or not. Why don't backbone does this by default? ahh, my friend, who knows.
    * @method fetch
    * @param args {Object}
    */
    fetch: function(args) {
      var self = this;
      // var date = new Date();
      this.trigger('loadModelStarted');
      $.when(this.elder('fetch', args)).done(function(ev){
        self.trigger('loadModelCompleted', ev);
        // var dateComplete = new Date()
        // console.log('completed in '+(dateComplete - date));
      }).fail(function(ev) {
        self.trigger('loadModelFailed', ev);
      })
    },
    /**
    * Changes the attribute used as Id
    * @method setIdAttribute
    * @param attr {String}
    */
    setIdAttribute: function(attr) {
      this.idAttribute = attr;
    },
    /**
    * Listen for an event on another object and triggers on itself, with the same name or a new one
    * @method retrigger
    * @param ev {String} event who triggers the action
    * @param obj {Object} object where the event happens
    * @param obj {Object} [optional] name of the retriggered event;
    * @todo [xabel]: This method is repeated here and in the base view definition. There's should be a way to make it unique
    */
    retrigger: function(ev, obj, retrigEvent) {
      if(!retrigEvent) {
        retrigEvent = ev;
      }
      var self = this;
      obj.bind && obj.bind(ev, function() {
        self.trigger(retrigEvent);
      }, self)
    },

    /**
     * We need to override backbone save method to be able to introduce new kind of triggers that
     * for some reason are not present in the original library. Because you know, it would be nice
     * to be able to differenciate "a model has been updated" of "a model is being saved".
     * TODO: remove jquery from here
     * @param  {object} opt1
     * @param  {object} opt2
     * @return {$.Deferred}
     */
    save: function(opt1, opt2) {
      var self = this;
      if(!opt2 || !opt2.silent) this.trigger('saving');
      var promise = Backbone.Model.prototype.save.apply(this, arguments);
      $.when(promise).done(function() {
        if(!opt2 || !opt2.silent) self.trigger('saved');
      }).fail(function() {
        if(!opt2 || !opt2.silent) self.trigger('errorSaving')
      })
      return promise;
    }
  });
})();

},{}],9:[function(require,module,exports){
/*
# metrics profiler

## timing

```
 var timer = Profiler.metric('resource:load')
 time.start();
 ...
 time.end();
```

## counters

```
 var counter = Profiler.metric('requests')
 counter.inc();   // 1
 counter.inc(10); // 11
 counter.dec()    // 10
 counter.dec(10)  // 0
```

## Calls per second
```
  var fps = Profiler.metric('fps')
  function render() {
    fps.mark();
  }
```
*/
(function(exports) {

var MAX_HISTORY = 1024;
function Profiler() {}
Profiler.metrics = {};
Profiler._backend = null;

Profiler.get = function(name) {
  return Profiler.metrics[name] || {
    max: 0,
    min: Number.MAX_VALUE,
    avg: 0,
    total: 0,
    count: 0,
    last: 0,
    history: typeof(Float32Array) !== 'undefined' ? new Float32Array(MAX_HISTORY) : []
  };
};

Profiler.backend = function (_) {
  Profiler._backend = _;
}

Profiler.new_value = function (name, value, type, defer) {
  type =  type || 'i';
  var t = Profiler.metrics[name] = Profiler.get(name);


  t.max = Math.max(t.max, value);
  t.min = Math.min(t.min, value);
  t.total += value;
  ++t.count;
  t.avg = t.total / t.count;
  t.history[t.count%MAX_HISTORY] = value;

  if (!defer) {
    Profiler._backend && Profiler._backend([type, name, value]);
  } else {
    var n = new Date().getTime()
    // don't allow to send stats quick
    if (n - t.last > 1000) {
      Profiler._backend && Profiler._backend([type, name, t.avg]);
      t.last = n;
    }
  }
};

Profiler.print_stats = function () {
  for (k in Profiler.metrics) {
    var t = Profiler.metrics[k];
    console.log(" === " + k + " === ");
    console.log(" max: " + t.max);
    console.log(" min: " + t.min);
    console.log(" avg: " + t.avg);
    console.log(" count: " + t.count);
    console.log(" total: " + t.total);
  }
};

function Metric(name) {
  this.t0 = null;
  this.name = name;
  this.count = 0;
}

Metric.prototype = {

  //
  // start a time measurement
  //
  start: function() {
    this.t0 = +new Date();
    return this;
  },

  // elapsed time since start was called
  _elapsed: function() {
    return +new Date() - this.t0;
  },

  //
  // finish a time measurement and register it
  // ``start`` should be called first, if not this 
  // function does not take effect
  //
  end: function(defer) {
    if (this.t0 !== null) {
      Profiler.new_value(this.name, this._elapsed(), 't', defer);
      this.t0 = null;
    }
  },

  //
  // increments the value 
  // qty: how many, default = 1
  //
  inc: function(qty) {
    qty = qty === undefined ? 1: qty;
    Profiler.new_value(this.name, qty, 'i');
  },

  //
  // decrements the value 
  // qty: how many, default = 1
  //
  dec: function(qty) {
    qty = qty === undefined ? 1: qty;
    Profiler.new_value(this.name, qty, 'd');
  },

  //
  // measures how many times per second this function is called
  //
  mark: function() {
    ++this.count;
    if(this.t0 === null) {
      this.start();
      return;
    }
    var elapsed = this._elapsed();
    if(elapsed > 1) {
      Profiler.new_value(this.name, this.count);
      this.count = 0;
      this.start();
    }
  }
};

Profiler.metric = function(name) {
  return new Metric(name);
};

exports.Profiler = Profiler;

})(cdb.core);

},{}],10:[function(require,module,exports){
(function(exports, w) {
  exports.sanitize = w.html;

  /**
   * Sanitize inputHtml of unsafe HTML tags & attributes
   * @param {String} inputHtml
   * @param {Function,false,null,undefined} optionalSanitizer By default undefined, for which the default sanitizer will be used.
   *   Pass a function (that takes inputHtml) to sanitize yourself, or false/null to skip sanitize call.
   */
  exports.sanitize.html = function(inputHtml, optionalSanitizer) {
    if (!inputHtml) return;

    if (optionalSanitizer === undefined) {
      return exports.sanitize.sanitize(inputHtml, function(url) {
        // Return all URLs for <a href=""> (javascript: and data: URLs are removed prior to this fn is called)
        return url;
      });
    } else if (typeof optionalSanitizer === 'function') {
      return optionalSanitizer(inputHtml);
    } else { // alt sanitization set to false/null/other, treat as if caller takes responsibility to sanitize output
      return inputHtml;
    }
  };

})(cdb.core, window);

},{}],11:[function(require,module,exports){
/**
 * template system
 * usage:
   var tmpl = new cdb.core.Template({
     template: "hi, my name is {{ name }}",
     type: 'mustache' // undescore by default
   });
   console.log(tmpl.render({name: 'rambo'})));
   // prints "hi, my name is rambo"


   you could pass the compiled tempalte directly:

   var tmpl = new cdb.core.Template({
     compiled: function() { return 'my compiled template'; }
   });
 */

cdb.core.Template = Backbone.Model.extend({

  initialize: function() {
    this.bind('change', this._invalidate);
    this._invalidate();
  },

  url: function() {
    return this.get('template_url');
  },

  parse: function(data) {
    return {
      'template': data
    };
  },

  _invalidate: function() {
    this.compiled = null;
    if(this.get('template_url')) {
      this.fetch();
    }
  },

  compile: function() {
    var tmpl_type = this.get('type') || 'underscore';
    var fn = cdb.core.Template.compilers[tmpl_type];
    if(fn) {
      return fn(this.get('template'));
    } else {
      cdb.log.error("can't get rendered for " + tmpl_type);
    }
    return null;
  },

  /**
   * renders the template with specified vars
   */
  render: function(vars) {
    var c = this.compiled = this.compiled || this.get('compiled') || this.compile();
    var rendered = c(vars);
    return rendered;
  },

  asFunction: function() {
    return _.bind(this.render, this);
  }

}, {
  compilers: {
    'underscore': _.template,
    'mustache': typeof(Mustache) === 'undefined' ?
      null :
      // Replacement for Mustache.compile, which was removed in version 0.8.0
      function compile(template) {
        Mustache.parse(template);
        return function (view, partials) {
          return Mustache.render(template, view, partials);
        };
      }
  },
  compile: function(tmpl, type) {
    var t = new cdb.core.Template({
      template: tmpl,
      type: type || 'underscore'
    });
    return _.bind(t.render, t);
  }
}
);

cdb.core.TemplateList = Backbone.Collection.extend({

  model: cdb.core.Template,

  getTemplate: function(template_name) {

    if (this.namespace) {
      template_name = this.namespace + template_name;
    }

    var t = this.find(function(t) {
        return t.get('name') === template_name;
    });

    if(t) {
      return _.bind(t.render, t);
    }

    cdb.log.error(template_name + " not found");

    return null;
  }
});

/**
 * global variable
 */
cdb.templates = new cdb.core.TemplateList();

/**
 * load JST templates.
 * rails creates a JST variable with all the templates.
 * This functions loads them as default into cbd.template
 */
cdb._loadJST = function() {
  if(typeof(window.JST) !== undefined) {
    cdb.templates.reset(
      _(JST).map(function(tmpl, name) {
        return { name: name, compiled: tmpl };
      })
    );
  }
};


},{}],12:[function(require,module,exports){
cdb.core.util = {};

cdb.core.util.isCORSSupported = function() {
  return 'withCredentials' in new XMLHttpRequest();
};

cdb.core.util.array2hex = function(byteArr) {
  var encoded = []
  for(var i = 0; i < byteArr.length; ++i) {
    encoded.push(String.fromCharCode(byteArr[i] + 128));
  }
  return cdb.core.util.btoa(encoded.join(''));
};

cdb.core.util.btoa = function() {
  if (typeof window['btoa'] == 'function') {
    return cdb.core.util.encodeBase64Native;
  };

  return cdb.core.util.encodeBase64;
};

cdb.core.util.encodeBase64Native = function (input) {
  return btoa(input);
};

// ie7 btoa,
// from http://phpjs.org/functions/base64_encode/
cdb.core.util.encodeBase64 = function (data) {
  var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
    ac = 0,
    enc = "",
    tmp_arr = [];

  if (!data) {
    return data;
  }

  do { // pack three octets into four hexets
    o1 = data.charCodeAt(i++);
    o2 = data.charCodeAt(i++);
    o3 = data.charCodeAt(i++);

    bits = o1 << 16 | o2 << 8 | o3;

    h1 = bits >> 18 & 0x3f;
    h2 = bits >> 12 & 0x3f;
    h3 = bits >> 6 & 0x3f;
    h4 = bits & 0x3f;

    // use hexets to index into b64, and append result to encoded string
    tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
  } while (i < data.length);

  enc = tmp_arr.join('');

  var r = data.length % 3;
  return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
};

cdb.core.util.uniqueCallbackName = function(str) {
  cdb.core.util._callback_c = cdb.core.util._callback_c || 0;
  ++cdb.core.util._callback_c;
  return cdb.core.util.crc32(str) + "_" + cdb.core.util._callback_c;
};

cdb.core.util.crc32 = function(str) {
  var crcTable = cdb.core.util._crcTable || (cdb.core.util._crcTable = cdb.core.util._makeCRCTable());
  var crc = 0 ^ (-1);

  for (var i = 0, l = str.length; i < l; ++i ) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
  }

  return (crc ^ (-1)) >>> 0;
};

cdb.core.util._makeCRCTable = function() {
  var c;
  var crcTable = [];
  for(var n = 0; n < 256; ++n){
    c = n;
    for(var k = 0; k < 8; ++k){
        c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[n] = c;
  }
  return crcTable;
};

cdb.core.util._inferBrowser = function(ua){
  var browser = {};
  ua = ua || window.navigator.userAgent;
  function detectIE() {
    var msie = ua.indexOf('MSIE ');
    var trident = ua.indexOf('Trident/');
    if (msie > -1 || trident > -1) return true;
    return false;
  };

  function getIEVersion(){
    if (!document.compatMode) return 5
    if (!window.XMLHttpRequest) return 6
    if (!document.querySelector) return 7;
    if (!document.addEventListener) return 8;
    if (!window.atob) return 9;
    if (document.all) return 10;
    else return 11;
  };

  if(detectIE()){
    browser.ie = {version: getIEVersion()}
  }

  else if(ua.indexOf('Edge/') > -1) browser.edge = ua;
  else if(ua.indexOf('Chrome') > -1) browser.chrome = ua;
  else if(ua.indexOf('Firefox') > -1) browser.firefox = ua;
  else if(ua.indexOf("Opera") > -1) browser.opera = ua;
  else if(ua.indexOf("Safari") > -1) browser.safari = ua;
  return browser;
}

cdb.core.util.browser = cdb.core.util._inferBrowser();
},{}],13:[function(require,module,exports){
(function() {

  /**
   * Base View for all CartoDB views.
   * DO NOT USE Backbone.View directly
   */
  var View = cdb.core.View = Backbone.View.extend({
    classLabel: 'cdb.core.View',
    constructor: function(options) {
      this._models = [];
      this._subviews = {};
      Backbone.View.call(this, options);
      View.viewCount++;
      View.views[this.cid] = this;
      this._created_at = new Date();
      cdb.core.Profiler.new_value('total_views', View.viewCount);
    },

    add_related_model: function(m) {
      if(!m) throw "added non valid model"
      this._models.push(m);
    },

    addView: function(v) {
      this._subviews[v.cid] = v;
      v._parent = this;
    },

    removeView: function(v) {
      delete this._subviews[v.cid];
    },

    clearSubViews: function() {
      _(this._subviews).each(function(v) {
        v.clean();
      });
      this._subviews = {};
    },

    /**
     * this methid clean removes the view
     * and clean and events associated. call it when
     * the view is not going to be used anymore
     */
    clean: function() {
      var self = this;
      this.trigger('clean');
      this.clearSubViews();
      // remove from parent
      if(this._parent) {
        this._parent.removeView(this);
        this._parent = null;
      }
      this.remove();
      this.unbind();
      // remove this model binding
      if (this.model && this.model.unbind) this.model.unbind(null, null, this); 
      // remove model binding
      _(this._models).each(function(m) {
        m.unbind(null, null, self);
      });
      this._models = [];
      View.viewCount--;
      delete View.views[this.cid];
      return this;
    },

    /**
     * utility methods
     */

    getTemplate: function(tmpl) {
      if(this.options.template) {
        return  _.template(this.options.template);
      }
      return cdb.templates.getTemplate(tmpl);
    },

    show: function() {
        this.$el.show();
    },

    hide: function() {
        this.$el.hide();
    },

    /**
    * Listen for an event on another object and triggers on itself, with the same name or a new one
    * @method retrigger
    * @param ev {String} event who triggers the action
    * @param obj {Object} object where the event happens
    * @param obj {Object} [optional] name of the retriggered event;
    */
    retrigger: function(ev, obj, retrigEvent) {
      if(!retrigEvent) {
        retrigEvent = ev;
      }
      var self = this;
      obj.bind && obj.bind(ev, function() {
        self.trigger(retrigEvent);
      }, self)
      // add it as related model//object
      this.add_related_model(obj);
    },
    /**
    * Captures an event and prevents the default behaviour and stops it from bubbling
    * @method killEvent
    * @param event {Event}
    */
    killEvent: function(ev) {
      if(ev && ev.preventDefault) {
        ev.preventDefault();
      };
      if(ev && ev.stopPropagation) {
        ev.stopPropagation();
      };
    },

    /**
    * Remove all the tipsy tooltips from the document
    * @method cleanTooltips
    */
    cleanTooltips: function() {
      this.$('.tipsy').remove();
    }




  }, {
    viewCount: 0,
    views: {},

    /**
     * when a view with events is inherit and you want to add more events
     * this helper can be used:
     * var MyView = new core.View({
     *  events: cdb.core.View.extendEvents({
     *      'click': 'fn'
     *  })
     * });
     */
    extendEvents: function(newEvents) {
      return function() {
        return _.extend(newEvents, this.constructor.__super__.events);
      };
    },

    /**
     * search for views in a view and check if they are added as subviews
     */
    runChecker: function() {
      _.each(cdb.core.View.views, function(view) {
        _.each(view, function(prop, k) {
          if( k !== '_parent' &&
              view.hasOwnProperty(k) &&
              prop instanceof cdb.core.View &&
              view._subviews[prop.cid] === undefined) {
            console.log("=========");
            console.log("untracked view: ");
            console.log(prop.el);
            console.log('parent');
            console.log(view.el);
            console.log(" ");
          }
        });
      });
    }
  });

})();

},{}],14:[function(require,module,exports){


/*
 *  common functions for cartodb connector
 */

function CartoDBLayerCommon() {
  this.visible = true;
}

CartoDBLayerCommon.prototype = {

  // the way to show/hidelayer is to set opacity
  // removing the interactivty at the same time
  show: function() {
    this.setOpacity(this.options.previous_opacity === undefined ? 0.99: this.options.previous_opacity);
    delete this.options.previous_opacity;
    this._interactionDisabled = false;
    this.visible = true;
  },

  hide: function() {
    if(this.options.previous_opacity == undefined) {
      this.options.previous_opacity = this.options.opacity;
    }
    this.setOpacity(0);
    // disable here interaction for all the layers
    this._interactionDisabled = true;
    this.visible = false;
  },

  toggle: function() {
    this.isVisible() ? this.hide() : this.show();
    return this.isVisible();
  },

  /**
   * Returns if the layer is visible or not
   */
  isVisible: function() {
    return this.visible;
  },

  /**
   * Active or desactive interaction
   * @params enable {Number} layer number
   * @params layer {Boolean} Choose if wants interaction or not
   */
  setInteraction: function(layer, b) {
    // shift arguments to maintain caompatibility
    if(b == undefined) {
      b = layer;
      layer = 0;
    }
    var layerInteraction;
    this.interactionEnabled[layer] = b;
    if(!b) {
      layerInteraction = this.interaction[layer];
      if(layerInteraction) {
        layerInteraction.remove();
        this.interaction[layer] = null;
      }
    } else {
      // if urls is null it means that setInteraction will be called
      // when the layergroup token was recieved, then the real interaction
      // layer will be created
      if(this.urls) {
        // generate the tilejson from the urls. wax needs it
        var layer_index = this.getLayerIndexByNumber(+layer);
        var tilejson = this._tileJSONfromTiles(layer_index, this.urls);

        // remove previous
        layerInteraction = this.interaction[layer];
        if(layerInteraction) {
          layerInteraction.remove();
        }
        var self = this;

        // add the new one
        this.interaction[layer] = this.interactionClass()
          .map(this.options.map)
          .tilejson(tilejson)
          .on('on', function(o) {
            if (self._interactionDisabled) return;
            o.layer = +layer;
            self._manageOnEvents(self.options.map, o);
          })
          .on('off', function(o) {
            if (self._interactionDisabled) return;
            o = o || {}
            o.layer = +layer;
            self._manageOffEvents(self.options.map, o);
          });
      }
    }
    return this;
  },

  setOptions: function (opts) {

    if (typeof opts != "object" || opts.length) {
      throw new Error(opts + ' options must be an object');
    }

    _.extend(this.options, opts);

    var opts = this.options;

    this.options.query = this.options.query || "select * from " + this.options.table_name;
    if(this.options.query_wrapper) {
      this.options.query = _.template(this.options.query_wrapper)({ sql: this.options.query });
    }

    this.setSilent(true);
    opts.interaction && this.setInteraction(opts.interaction);
    opts.opacity && this.setOpacity(opts.opacity);
    opts.query && this.setQuery(opts.query.replace(/\{\{table_name\}\}/g, this.options.table_name));
    opts.tile_style && this.setCartoCSS(opts.tile_style.replace(new RegExp( opts.table_name, "g"), "layer0"));
    opts.cartocss && this.setCartoCSS(opts.cartocss);
    opts.interactivity && this.setInteractivity(opts.interactivity);
    opts.visible ? this.show() : this.hide();
    this.setSilent(false);
    this._definitionUpdated();
  },

  _getLayerDefinition: function() {
    // set params
    var params = {};
    var opts = this.options;
    var sql, cartocss, cartocss_version;
    sql = opts.query || "select * from " + opts.table_name;

    if(opts.query_wrapper) {
      sql = _.template(opts.query_wrapper)({ sql: sql });
    }

    cartocss = opts.tile_style;
    cartocss_version = opts.cartocss_version || '2.1.0';

    // extra_params?
    for (var _param in opts.extra_params) {
      var v = opts.extra_params[_param]
      params[_param] = v.replace ? v.replace(/\{\{table_name\}\}/g, opts.table_name): v;
    }
    sql = sql.replace(/\{\{table_name\}\}/g, opts.table_name);
    cartocss = cartocss.replace(/\{\{table_name\}\}/g, opts.table_name);
    cartocss = cartocss.replace(new RegExp( opts.table_name, "g"), "layer0");

    return {
      sql: sql,
      cartocss: cartocss,
      cartocss_version: cartocss_version,
      params: params,
      interactivity: opts.interactivity
    }
  },

  error: function(e) {
    //console.log(e.error);
  },

  tilesOk: function() {
  },

  _clearInteraction: function() {
    for(var i in this.interactionEnabled) {
      if (this.interactionEnabled.hasOwnProperty(i) &&
        this.interactionEnabled[i]) {
        this.setInteraction(i, false);
      }
    }
  },

  _reloadInteraction: function() {
    for(var i in this.interactionEnabled) {
      if (this.interactionEnabled.hasOwnProperty(i) &&
        this.interactionEnabled[i]) {
          this.setInteraction(i, false);
          this.setInteraction(i, true);
      }
    }
  },

  /**
   *  Check the tiles
   */
  _checkTiles: function() {
    var xyz = {z: 4, x: 6, y: 6}
      , self = this
      , img = new Image()
      , urls = this._tileJSON()

    getTiles(function(urls) {

      var grid_url = urls.tiles[0]
          .replace(/\{z\}/g,xyz.z)
          .replace(/\{x\}/g,xyz.x)
          .replace(/\{y\}/g,xyz.y);

      this.options.ajax({
        method: "get",
        url: grid_url,
        crossDomain: true,
        success: function() {
          self.tilesOk();
          clearTimeout(timeout)
        },
        error: function(xhr, msg, data) {
          clearTimeout(timeout);
          self.error(xhr.responseText && JSON.parse(xhr.responseText));
        }
      });
    });

    var timeout = setTimeout(function(){
      clearTimeout(timeout);
      self.error("tile timeout");
    }, 30000);

  }
};

cdb.geo.common = {};

cdb.geo.common.CartoDBLogo = {

  /**
   * Check if any class already exists
   * in the provided container
   */
  isWadusAdded: function(container, className) {
    // Check if any cartodb-logo exists within container
    var a = [];
    var re = new RegExp('\\b' + className + '\\b');
    var els = container.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
      if(re.test(els[i].className))a.push(els[i]);

    return a.length > 0;
  },

  /**
   *  Check if browser supports retina images
   */
  isRetinaBrowser: function() {
    return  ('devicePixelRatio' in window && window.devicePixelRatio > 1) ||
            ('matchMedia' in window && window.matchMedia('(min-resolution:144dpi)') &&
            window.matchMedia('(min-resolution:144dpi)').matches);
  },

  /**
   * Add Cartodb logo
   * It needs a position, timeout if it is needed and the container where to add it
   */
  addWadus: function(position, timeout, container) {
    var self = this;
    setTimeout(function() {
      if (!self.isWadusAdded(container, 'cartodb-logo')) {
        var cartodb_link = document.createElement("div");
        var is_retina = self.isRetinaBrowser();
        cartodb_link.setAttribute('class','cartodb-logo');
        cartodb_link.setAttribute('style',"position:absolute; bottom:0; left:0; display:block; border:none; z-index:1000000;");
        var protocol = location.protocol.indexOf('https') === -1 ? 'http': 'https';
        var link = cdb.config.get('cartodb_logo_link');
        cartodb_link.innerHTML = "<a href='" + link + "' target='_blank'><img width='71' height='29' src='" + protocol + "://cartodb.s3.amazonaws.com/static/new_logo" + (is_retina ? '@2x' : '') + ".png' style='position:absolute; bottom:" + 
          ( position.bottom || 0 ) + "px; left:" + ( position.left || 0 ) + "px; display:block; width:71px!important; height:29px!important; border:none; outline:none;' alt='CartoDB' title='CartoDB' />";
        container.appendChild(cartodb_link);
      }
    },( timeout || 0 ));
  }
};


},{}],15:[function(require,module,exports){


/**
 * geocoders for different services
 *
 * should implement a function called geocode the gets
 * the address and call callback with a list of placemarks with lat, lon
 * (at least)
 */

cdb.geo.geocoder.YAHOO = {

  keys: {
    app_id: "nLQPTdTV34FB9L3yK2dCXydWXRv3ZKzyu_BdCSrmCBAM1HgGErsCyCbBbVP2Yg--"
  },

  geocode: function(address, callback) {
    address = address.toLowerCase()
      .replace(/é/g,'e')
      .replace(/á/g,'a')
      .replace(/í/g,'i')
      .replace(/ó/g,'o')
      .replace(/ú/g,'u')
      .replace(/ /g,'+');

      var protocol = '';
      if(location.protocol.indexOf('http') === -1) {
        protocol = 'http:';
      }

      $.getJSON(protocol + '//query.yahooapis.com/v1/public/yql?q='+encodeURIComponent('SELECT * FROM json WHERE url="http://where.yahooapis.com/geocode?q=' + address + '&appid=' + this.keys.app_id + '&flags=JX"') + '&format=json&callback=?', function(data) {

         var coordinates = [];
         if (data && data.query && data.query.results && data.query.results.json && data.query.results.json.ResultSet && data.query.results.json.ResultSet.Found != "0") {

          // Could be an array or an object |arg!
          var res;

          if (_.isArray(data.query.results.json.ResultSet.Results)) {
            res = data.query.results.json.ResultSet.Results;
          } else {
            res = [data.query.results.json.ResultSet.Results];
          }

          for(var i in res) {
            var r = res[i]
              , position;

            position = {
              lat: r.latitude,
              lon: r.longitude
            };

            if (r.boundingbox) {
              position.boundingbox = r.boundingbox;
            }

            coordinates.push(position);
          }
        }

        callback(coordinates);
      });
  }
}



cdb.geo.geocoder.NOKIA = {

  keys: {
    app_id:   "KuYppsdXZznpffJsKT24",
    app_code: "A7tBPacePg9Mj_zghvKt9Q"
  },

  geocode: function(address, callback) {
    address = address.toLowerCase()
      .replace(/é/g,'e')
      .replace(/á/g,'a')
      .replace(/í/g,'i')
      .replace(/ó/g,'o')
      .replace(/ú/g,'u');

      var protocol = '';
      if(location.protocol.indexOf('http') === -1) {
        protocol = 'http:';
      }

      $.getJSON(protocol + '//places.nlp.nokia.com/places/v1/discover/search/?q=' + encodeURIComponent(address) + '&app_id=' + this.keys.app_id + '&app_code=' + this.keys.app_code + '&Accept-Language=en-US&at=0,0&callback=?', function(data) {

         var coordinates = [];
         if (data && data.results && data.results.items && data.results.items.length > 0) {

          var res = data.results.items;

          for(var i in res) {
            var r = res[i]
              , position;

            position = {
              lat: r.position[0],
              lon: r.position[1]
            };

            if (r.bbox) {
              position.boundingbox = {
                north: r.bbox[3],
                south: r.bbox[1],
                east: r.bbox[2],
                west: r.bbox[0]
              }
            }
            if (r.category) {
              position.type = r.category.id;
            }
            if (r.title) {
              position.title = r.title;
            }
            coordinates.push(position);
          }
        }

        if (callback) {
          callback.call(this, coordinates);
        }
      });
  }
}

},{}],16:[function(require,module,exports){


/**
 * basic geometries, all of them based on geojson
 */
cdb.geo.Geometry = cdb.core.Model.extend({
  isPoint: function() {
    var type = this.get('geojson').type;
    if(type && type.toLowerCase() === 'point')
      return true;
    return false;
  }
});

cdb.geo.Geometries = Backbone.Collection.extend({});

/**
 * create a geometry
 * @param geometryModel geojson based geometry model, see cdb.geo.Geometry
 */
function GeometryView() { }

_.extend(GeometryView.prototype, Backbone.Events,{

  edit: function() {
    throw new Error("to be implemented");
  }

});

},{}],17:[function(require,module,exports){
(function() {
/**
 * view for markers
 */
function PointView(geometryModel) {
  var self = this;
  // events to link
  var events = [
    'click',
    'dblclick',
    'mousedown',
    'mouseover',
    'mouseout',
    'dragstart',
    'drag',
    'dragend'
  ];

  this._eventHandlers = {};
  this.model = geometryModel;
  this.points = [];

  var style = _.clone(geometryModel.get('style')) || {};
  var iconAnchor = this.model.get('iconAnchor');

  var icon = {
    url: this.model.get('iconUrl') || cdb.config.get('assets_url') + '/images/layout/default_marker.png',
    anchor: {
      x: iconAnchor && iconAnchor[0] || 10,
      y: iconAnchor && iconAnchor[1] || 10,
    }
  };

  this.geom = new GeoJSON (
    geometryModel.get('geojson'),
    {
      icon: icon,
      raiseOnDrag: false,
      crossOnDrag: false
    }
  );

  // bind events
  var i;
  for(i = 0; i < events.length; ++i) {
    var e = events[i];
    google.maps.event.addListener(this.geom, e, self._eventHandler(e));
  }

  // link dragging
  this.bind('dragend', function(e, pos) {
    geometryModel.set({
      geojson: {
        type: 'Point',
        // geojson is lng,lat
        coordinates: [pos[1], pos[0]]
      }
    });
  });
}

PointView.prototype = new GeometryView();

PointView.prototype._eventHandler = function(evtType) {
  var self = this;
  var h = this._eventHandlers[evtType];
  if(!h) {
    h = function(e) {
      var latlng = e.latLng;
      var s = [latlng.lat(), latlng.lng()];
      self.trigger(evtType, e, s);
    };
    this._eventHandlers[evtType] = h;
  }
  return h;
};

PointView.prototype.edit = function(enable) {
  this.geom.setDraggable(enable);
};

/**
 * view for other geometries (polygons/lines)
 */
function PathView(geometryModel) {
  var self = this;
  // events to link
  var events = [
    'click',
    'dblclick',
    'mousedown',
    'mouseover',
    'mouseout',
  ];

  this._eventHandlers = {};
  this.model = geometryModel;
  this.points = [];



  var style = _.clone(geometryModel.get('style')) || {};

  this.geom = new GeoJSON (
    geometryModel.get('geojson'),
    style
  );

  /*_.each(this.geom._layers, function(g) {
    g.setStyle(geometryModel.get('style'));
    g.on('edit', function() {
      geometryModel.set('geojson', L.GeoJSON.toGeoJSON(self.geom));
    }, self);
  });
  */

  _.bindAll(this, '_updateModel');
  var self = this;

  function bindPath(p) {
    google.maps.event.addListener(p, 'insert_at', self._updateModel);
    /*
    google.maps.event.addListener(p, 'remove_at', this._updateModel);
    google.maps.event.addListener(p, 'set_at', this._updateModel);
    */
  }

  // TODO: check this conditions

  if(this.geom.getPaths) {
    var paths = this.geom.getPaths();

    if (paths && paths[0]) {
      // More than one path
      for(var i = 0; i < paths.length; ++i) {
        bindPath(paths[i]);
      }
    } else {
      // One path
      bindPath(paths);
      google.maps.event.addListener(this.geom, 'mouseup', this._updateModel);
    }
  } else {
    // More than one path
    if (this.geom.length) {
      for(var i = 0; i < this.geom.length; ++i) {
        bindPath(this.geom[i].getPath());
        google.maps.event.addListener(this.geom[i], 'mouseup', this._updateModel);
      }
    } else {
      // One path
      bindPath(this.geom.getPath());
      google.maps.event.addListener(this.geom, 'mouseup', this._updateModel);
    }
  }

  /*for(var i = 0; i < events.length; ++i) {
    var e = events[i];
    this.geom.on(e, self._eventHandler(e));
  }*/

}

PathView.prototype = new GeometryView();

PathView.getGeoJSON = function(geom, gType) {

  var coordFn = {
    'Polygon': 'getPath',
    'MultiPolygon': 'getPath',
    'LineString': 'getPath',
    'MultiLineString': 'getPath',
    'Point': 'getPosition',
    'MultiPoint': 'getPosition'
  };

  function _coord(latlng) {
    return [latlng.lng(), latlng.lat()];
  }

  function _coords(latlngs) {
    var c = [];
    for(var i = 0; i < latlngs.length; ++i) {
      c.push(_coord(latlngs.getAt(i)));
    }
    return c;
  }

  // single
  if(!geom.length || geom.length == 1) {
    var g = geom.length ? geom[0]: geom;
    var coords;
    if(gType == 'Point') {
      coords = _coord(g.getPosition());
    } else if(gType == 'MultiPoint') {
      coords = [_coord(g.getPosition())]
    } else if(gType == 'Polygon') {
      coords = [_coords(g.getPath())];
      coords[0].push(_coord(g.getPath().getAt(0)));
    } else if(gType == 'MultiPolygon') {
      coords = [];
      for(var p = 0; p < g.getPaths().length; ++p) {
        var c = _coords(g.getPaths().getAt(p));
        c.push(_coord(g.getPaths().getAt(p).getAt(0)));
        coords.push(c);
      }
      coords = [coords]
    } else if(gType == 'LineString') {
      coords = _coords(g.getPath());
    } else if(gType == 'MultiLineString') {
      //TODO: redo
      coords = [_coords(g.getPath())];
    }
    return {
      type: gType,
      coordinates: coords
    }
  } else {
    // poly
    var c = [];
    for(var i = 0; i < geom.length; ++i) {
      c.push(PathView.getGeoJSON(geom[i], gType).coordinates[0]);
    }
    return  {
      type: gType,
      coordinates: c
    }
  }
}

PathView.prototype._updateModel = function(e) {
  var self = this;
  setTimeout(function() {
  self.model.set('geojson', PathView.getGeoJSON(self.geom, self.model.get('geojson').type ));
  }, 100)
}

PathView.prototype.edit = function(enable) {

  var fn = enable ? 'enable': 'disable';
  var g = this.geom.length ? this.geom: [this.geom];
  for(var i = 0; i < g.length; ++i) {
    g[i].setEditable(enable);
  }
  if(!enable) {
    this.model.set('geojson', PathView.getGeoJSON(this.geom, this.model.get('geojson').type));
  }
};

cdb.geo.gmaps = cdb.geo.gmaps || {};

cdb.geo.gmaps.PointView = PointView;
cdb.geo.gmaps.PathView = PathView;



})();

},{}],18:[function(require,module,exports){

// if google maps is not defined do not load the class
if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {

  var DEFAULT_MAP_STYLE = [ { stylers: [ { saturation: -65 }, { gamma: 1.52 } ] },{ featureType: "administrative", stylers: [ { saturation: -95 }, { gamma: 2.26 } ] },{ featureType: "water", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "administrative.locality", stylers: [ { visibility: "off" } ] },{ featureType: "road", stylers: [ { visibility: "simplified" }, { saturation: -99 }, { gamma: 2.22 } ] },{ featureType: "poi", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "road.arterial", stylers: [ { visibility: "off" } ] },{ featureType: "road.local", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "transit", stylers: [ { visibility: "off" } ] },{ featureType: "road", elementType: "labels", stylers: [ { visibility: "off" } ] },{ featureType: "poi", stylers: [ { saturation: -55 } ] } ];



  cdb.geo.GoogleMapsMapView = cdb.geo.MapView.extend({

    layerTypeMap: {
      "tiled": cdb.geo.GMapsTiledLayerView,
      "cartodb": cdb.geo.GMapsCartoDBLayerView,
      "carto": cdb.geo.GMapsCartoDBLayerView,
      "plain": cdb.geo.GMapsPlainLayerView,
      "gmapsbase": cdb.geo.GMapsBaseLayerView,
      "layergroup": cdb.geo.GMapsCartoDBLayerGroupView,
      "namedmap": cdb.geo.GMapsCartoDBNamedMapView,
      "torque": function(layer, map) {
        return new cdb.geo.GMapsTorqueLayerView(layer, map);
      },
      "wms": cdb.geo.LeafLetWMSLayerView
    },

    initialize: function() {
      _.bindAll(this, '_ready');
      this._isReady = false;
      var self = this;

      cdb.geo.MapView.prototype.initialize.call(this);

      var bounds = this.map.getViewBounds();

      if (bounds) {
        this.showBounds(bounds);
      }

      var center = this.map.get('center');

      if (!this.options.map_object) {

        this.map_googlemaps = new google.maps.Map(this.el, {
          center: new google.maps.LatLng(center[0], center[1]),
          zoom: this.map.get('zoom'),
          minZoom: this.map.get('minZoom'),
          maxZoom: this.map.get('maxZoom'),
          disableDefaultUI: true,
          scrollwheel: this.map.get("scrollwheel"),
          mapTypeControl:false,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          backgroundColor: 'white',
          tilt: 0
        });

        this.map.bind('change:maxZoom', function() {
          self.map_googlemaps.setOptions({ maxZoom: self.map.get('maxZoom') });
        }, this);

        this.map.bind('change:minZoom', function() {
          self.map_googlemaps.setOptions({ minZoom: self.map.get('minZoom') });
        }, this);

      } else {

        this.map_googlemaps = this.options.map_object;
        this.setElement(this.map_googlemaps.getDiv());

        // fill variables
        var c = self.map_googlemaps.getCenter();

        self._setModelProperty({ center: [c.lat(), c.lng()] });
        self._setModelProperty({ zoom: self.map_googlemaps.getZoom() });

        // unset bounds to not change mapbounds
        self.map.unset('view_bounds_sw', { silent: true });
        self.map.unset('view_bounds_ne', { silent: true });

      }

      this.map.geometries.bind('add', this._addGeometry, this);
      this.map.geometries.bind('remove', this._removeGeometry, this);


      this._bindModel();
      this._addLayers();
      this.setAttribution();

      google.maps.event.addListener(this.map_googlemaps, 'center_changed', function() {
        var c = self.map_googlemaps.getCenter();
        self._setModelProperty({ center: [c.lat(), c.lng()] });
      });

      google.maps.event.addListener(this.map_googlemaps, 'zoom_changed', function() {
        self._setModelProperty({
          zoom: self.map_googlemaps.getZoom()
        });
      });

      google.maps.event.addListener(this.map_googlemaps, 'click', function(e) {
        self.trigger('click', e, [e.latLng.lat(), e.latLng.lng()]);
      });

      google.maps.event.addListener(this.map_googlemaps, 'dragend', function(e) {
        var c = self.map_googlemaps.getCenter();
        self.trigger('dragend', e, [c.lat(), c.lng()]);
      });

      google.maps.event.addListener(this.map_googlemaps, 'dblclick', function(e) {
        self.trigger('dblclick', e);
      });

      this.map.layers.bind('add', this._addLayer, this);
      this.map.layers.bind('remove', this._removeLayer, this);
      this.map.layers.bind('reset', this._addLayers, this);
      this.map.layers.bind('change:type', this._swicthLayerView, this);

      this.projector = new cdb.geo.CartoDBLayerGroupGMaps.Projector(this.map_googlemaps);

      this.projector.draw = this._ready;
    },

    _ready: function() {
      this.projector.draw = function() {};
      this.trigger('ready');
      this._isReady = true;
    },

    _setKeyboard: function(model, z) {
      this.map_googlemaps.setOptions({ keyboardShortcuts: z });
    },

    _setScrollWheel: function(model, z) {
      this.map_googlemaps.setOptions({ scrollwheel: z });
    },

    _setZoom: function(model, z) {
      z = z || 0;
      this.map_googlemaps.setZoom(z);
    },

    _setCenter: function(model, center) {
      var c = new google.maps.LatLng(center[0], center[1]);
      this.map_googlemaps.setCenter(c);
    },

    createLayer: function(layer) {
      var layer_view,
      layerClass = this.layerTypeMap[layer.get('type').toLowerCase()];

      if (layerClass) {
        try {
          layer_view = new layerClass(layer, this.map_googlemaps);
        } catch(e) {
          cdb.log.error("MAP: error creating '" +  layer.get('type') + "' layer -> " + e.message);
        }
      } else {
        cdb.log.error("MAP: " + layer.get('type') + " can't be created");
      }
      return layer_view;
    },

    _addLayer: function(layer, layers, opts) {
      opts = opts || {};
      var self = this;
      var lyr, layer_view;

      layer_view = this.createLayer(layer);

      if (!layer_view) {
        return;
      }
      return this._addLayerToMap(layer_view, opts);
    },

    _addLayerToMap: function(layer_view, opts) {
      var layer = layer_view.model;

      this.layers[layer.cid] = layer_view;

      if (layer_view) {
        var idx = _(this.layers).filter(function(lyr) { return !!lyr.getTile; }).length - 1;
        var isBaseLayer = _.keys(this.layers).length === 1 || (opts && opts.index === 0) || layer.get('order') === 0;
        // set base layer
        if(isBaseLayer && !opts.no_base_layer) {
          var m = layer_view.model;
          if(m.get('type') === 'GMapsBase') {
            layer_view._update();
          } else {
            layer_view.isBase = true;
            layer_view._update();
          }
        } else {
          idx -= 1;
          idx = Math.max(0, idx); // avoid -1
          if (layer_view.getTile) {
            if (!layer_view.gmapsLayer) {
              cdb.log.error("gmaps layer can't be null");
            }
            this.map_googlemaps.overlayMapTypes.setAt(idx, layer_view.gmapsLayer);
          } else {
            layer_view.gmapsLayer.setMap(this.map_googlemaps);
          }
        }
        if(opts === undefined || !opts.silent) {
          this.trigger('newLayerView', layer_view, layer, this);
        }
      } else {
        cdb.log.error("layer type not supported");
      }

      return layer_view;
    },

    pixelToLatLon: function(pos) {
      var latLng = this.projector.pixelToLatLng(new google.maps.Point(pos[0], pos[1]));
      return {
        lat: latLng.lat(),
        lng: latLng.lng()
      }
    },

    latLonToPixel: function(latlon) {
      return this.projector.latLngToPixel(new google.maps.LatLng(latlon[0], latlon[1]));
    },

    getSize: function() {
      return {
        x: this.$el.width(),
        y: this.$el.height()
      };
    },

    panBy: function(p) {
      var c = this.map.get('center');
      var pc = this.latLonToPixel(c);
      p.x += pc.x;
      p.y += pc.y;
      var ll = this.projector.pixelToLatLng(p);
      this.map.setCenter([ll.lat(), ll.lng()]);
    },

    getBounds: function() {
      if(this._isReady) {
        var b = this.map_googlemaps.getBounds();
        var sw = b.getSouthWest();
        var ne = b.getNorthEast();
        return [
          [sw.lat(), sw.lng()],
          [ne.lat(), ne.lng()]
        ];
      }
      return [ [0,0], [0,0] ];
    },

  setAttribution: function() {
    // Remove old one
    var old = document.getElementById("cartodb-gmaps-attribution")
      , attribution = this.map.get("attribution").join(", ");

      // If div already exists, remove it
      if (old) {
        old.parentNode.removeChild(old);
      }

      // Add new one
      var container           = this.map_googlemaps.getDiv()
        , cartodb_attribution = document.createElement("div");

      cartodb_attribution.setAttribute('id','cartodb-gmaps-attribution');
      cartodb_attribution.setAttribute('class', 'gmaps');
      container.appendChild(cartodb_attribution);
      cartodb_attribution.innerHTML = attribution;
    },

    setCursor: function(cursor) {
      this.map_googlemaps.setOptions({ draggableCursor: cursor });
    },

    _addGeomToMap: function(geom) {
      var geo = cdb.geo.GoogleMapsMapView.createGeometry(geom);
      if(geo.geom.length) {
        for(var i = 0 ; i < geo.geom.length; ++i) {
          geo.geom[i].setMap(this.map_googlemaps);
        }
      } else {
          geo.geom.setMap(this.map_googlemaps);
      }
      return geo;
    },

    _removeGeomFromMap: function(geo) {
      if(geo.geom.length) {
        for(var i = 0 ; i < geo.geom.length; ++i) {
          geo.geom[i].setMap(null);
        }
      } else {
        geo.geom.setMap(null);
      }
    },

    getNativeMap: function() {
      return this.map_googlemaps;
    },

    invalidateSize: function() {
      google.maps.event.trigger(this.map_googlemaps, 'resize');
    }

  }, {

    addLayerToMap: function(layer, map, pos) {
      pos = pos || 0;
      if (!layer) {
        cdb.log.error("gmaps layer can't be null");
      }
      if (layer.getTile) {
        map.overlayMapTypes.setAt(pos, layer);
      } else {
        layer.setMap(map);
      }
    },

    /**
    * create the view for the geometry model
    */
    createGeometry: function(geometryModel) {
      if(geometryModel.isPoint()) {
        return new cdb.geo.gmaps.PointView(geometryModel);
      }
      return new cdb.geo.gmaps.PathView(geometryModel);
    }
  });

}

},{}],19:[function(require,module,exports){

(function() {

if(typeof(google) == "undefined" || typeof(google.maps) == "undefined") 
  return;

/**
* base layer for all google maps
*/

var GMapsLayerView = function(layerModel, gmapsLayer, gmapsMap) {
  this.gmapsLayer = gmapsLayer;
  this.map = this.gmapsMap = gmapsMap;
  this.model = layerModel;
  this.model.bind('change', this._update, this);

  this.type = layerModel.get('type') || layerModel.get('kind');
  this.type = this.type.toLowerCase();
};

_.extend(GMapsLayerView.prototype, Backbone.Events);
_.extend(GMapsLayerView.prototype, {

  // hack function to search layer inside google maps layers
  _searchLayerIndex: function() {
    var self = this;
    var index = -1;
    this.gmapsMap.overlayMapTypes.forEach(
      function(layer, i) {
        if (layer == self) {
          index = i;
        }
      }
    );
    return index;
  },

  /**
   * remove layer from the map and unbind events
   */
  remove: function() {
    if(!this.isBase) {
      var self = this;
      var idx = this._searchLayerIndex();
      if(idx >= 0) {
        this.gmapsMap.overlayMapTypes.removeAt(idx);
      } else if (this.gmapsLayer.setMap){
        this.gmapsLayer.setMap(null);
      }
      this.model.unbind(null, null, this);
      this.unbind();
    }
  },

  refreshView: function() {
    var self = this;
    //reset to update
    if(this.isBase) {
      var a = '_baseLayer';
      this.gmapsMap.setMapTypeId(null);
      this.gmapsMap.mapTypes.set(a, this.gmapsLayer);
      this.gmapsMap.setMapTypeId(a);
    } else {
      var idx = this._searchLayerIndex();
      if(idx >= 0) {
        this.gmapsMap.overlayMapTypes.setAt(idx, this);
      }
    }
  },

  reload: function() { this.refreshView() ; },
  _update: function() { this.refreshView(); }


});

cdb.geo.GMapsLayerView = GMapsLayerView;

})();

},{}],20:[function(require,module,exports){

(function() {

if(typeof(google) == "undefined" || typeof(google.maps) == "undefined")
  return;

var GMapsBaseLayerView = function(layerModel, gmapsMap) {
  cdb.geo.GMapsLayerView.call(this, layerModel, null, gmapsMap);
};

_.extend(
  GMapsBaseLayerView.prototype,
  cdb.geo.GMapsLayerView.prototype,
  {
  _update: function() {
    var m = this.model;
    var types = {
      "roadmap":      google.maps.MapTypeId.ROADMAP,
      "gray_roadmap": google.maps.MapTypeId.ROADMAP,
      "dark_roadmap": google.maps.MapTypeId.ROADMAP,
      "hybrid":       google.maps.MapTypeId.HYBRID,
      "satellite":    google.maps.MapTypeId.SATELLITE,
      "terrain":      google.maps.MapTypeId.TERRAIN
    };

    this.gmapsMap.setOptions({
      mapTypeId: types[m.get('base_type')]
    });

    this.gmapsMap.setOptions({
      styles: m.get('style') || DEFAULT_MAP_STYLE
    });
  },
  remove: function() { }
});


cdb.geo.GMapsBaseLayerView = GMapsBaseLayerView;


})();

},{}],21:[function(require,module,exports){
(function() {
// if google maps is not defined do not load the class
if(typeof(google) == "undefined" || typeof(google.maps) == "undefined")
  return;

// helper to get pixel position from latlon
var Projector = function(map) { this.setMap(map); };
Projector.prototype = new google.maps.OverlayView();
Projector.prototype.draw = function() {};
Projector.prototype.latLngToPixel = function(point) {
  var p = this.getProjection();
  if(p) {
    return p.fromLatLngToContainerPixel(point);
  }
  return [0, 0];
};
Projector.prototype.pixelToLatLng = function(point) {
  var p = this.getProjection();
  if(p) {
    return p.fromContainerPixelToLatLng(point);
  }
  return [0, 0];
  //return this.map.getProjection().fromPointToLatLng(point);
};

var CartoDBLayer = function(options) {

  var default_options = {
    query:          "SELECT * FROM {{table_name}}",
    opacity:        0.99,
    attribution:    cdb.config.get('cartodb_attributions'),
    opacity:        1,
    debug:          false,
    visible:        true,
    added:          false,
    extra_params:   {},
    layer_definition_version: '1.0.0'
  };

  this.options = _.defaults(options, default_options);

  if (!options.table_name || !options.user_name || !options.tile_style) {
      throw ('cartodb-gmaps needs at least a CartoDB table name, user_name and tile_style');
  }


  this.options.layer_definition = {
    version: this.options.layer_definition_version,
    layers: [{
      type: 'cartodb',
      options: this._getLayerDefinition(),
      infowindow: this.options.infowindow
    }]
  };
  cdb.geo.CartoDBLayerGroupGMaps.call(this, this.options);

  this.setOptions(this.options);

};

_.extend(CartoDBLayer.prototype, cdb.geo.CartoDBLayerGroupGMaps.prototype);

CartoDBLayer.prototype.setQuery = function (layer, sql) {
  if(sql === undefined) {
    sql = layer;
    layer = 0;
  }
  sql = sql || 'select * from ' + this.options.table_name;
  LayerDefinition.prototype.setQuery.call(this, layer, sql);
};

cdb.geo.CartoDBLayerGMaps = CartoDBLayer;

/**
* gmaps cartodb layer
*/

var GMapsCartoDBLayerView = function(layerModel, gmapsMap) {
  var self = this;

  _.bindAll(this, 'featureOut', 'featureOver', 'featureClick');

  var opts = _.clone(layerModel.attributes);

  opts.map =  gmapsMap;

  var // preserve the user's callbacks
  _featureOver  = opts.featureOver,
  _featureOut   = opts.featureOut,
  _featureClick = opts.featureClick;

  opts.featureOver  = function() {
    _featureOver  && _featureOver.apply(this, arguments);
    self.featureOver  && self.featureOver.apply(this, arguments);
  };

  opts.featureOut  = function() {
    _featureOut  && _featureOut.apply(this, arguments);
    self.featureOut  && self.featureOut.apply(this, arguments);
  };

  opts.featureClick  = function() {
    _featureClick  && _featureClick.apply(this, arguments);
    self.featureClick  && self.featureClick.apply(opts, arguments);
  };

  cdb.geo.CartoDBLayerGMaps.call(this, opts);
  cdb.geo.GMapsLayerView.call(this, layerModel, this, gmapsMap);
};

cdb.geo.GMapsCartoDBLayerView = GMapsCartoDBLayerView;


_.extend(
  GMapsCartoDBLayerView.prototype,
  cdb.geo.CartoDBLayerGMaps.prototype,
  cdb.geo.GMapsLayerView.prototype,
  {

  _update: function() {
    this.setOptions(this.model.attributes);
  },

  reload: function() {
    this.model.invalidate();
  },

  remove: function() {
    cdb.geo.GMapsLayerView.prototype.remove.call(this);
    this.clear();
  },

  featureOver: function(e, latlon, pixelPos, data) {
    // dont pass gmaps LatLng
    this.trigger('featureOver', e, [latlon.lat(), latlon.lng()], pixelPos, data, 0);
  },

  featureOut: function(e) {
    this.trigger('featureOut', e);
  },

  featureClick: function(e, latlon, pixelPos, data, layer) {
    // dont pass leaflet lat/lon
    this.trigger('featureClick', e, [latlon.lat(), latlon.lng()], pixelPos, data, 0);
  },

  error: function(e) {
    if(this.model) {
      //trigger the error form _checkTiles in the model
      this.model.trigger('error', e?e.error:'unknown error');
      this.model.trigger('tileError', e?e.error:'unknown error');
    }
  },

  tilesOk: function(e) {
    this.model.trigger('tileOk');
  },

  loading: function() {
    this.trigger("loading");
  },

  finishLoading: function() {
    this.trigger("load");
  }


});

})();

},{}],22:[function(require,module,exports){
(function() {
// if google maps is not defined do not load the class
if(typeof(google) == "undefined" || typeof(google.maps) == "undefined") {
  return;
}

// helper to get pixel position from latlon
var Projector = function(map) { this.setMap(map); };
Projector.prototype = new google.maps.OverlayView();
Projector.prototype.draw = function() {};
Projector.prototype.latLngToPixel = function(point) {
  var p = this.getProjection();
  if(p) {
    return p.fromLatLngToContainerPixel(point);
  }
  return [0, 0];
};
Projector.prototype.pixelToLatLng = function(point) {
  var p = this.getProjection();
  if(p) {
    return p.fromContainerPixelToLatLng(point);
  }
  return [0, 0];
  //return this.map.getProjection().fromPointToLatLng(point);
};

var default_options = {
  opacity:        0.99,
  attribution:    cdb.config.get('cartodb_attributions'),
  debug:          false,
  visible:        true,
  added:          false,
  tiler_domain:   "cartodb.com",
  tiler_port:     "80",
  tiler_protocol: "http",
  sql_api_domain:     "cartodb.com",
  sql_api_port:       "80",
  sql_api_protocol:   "http",
  extra_params:   {
  },
  cdn_url:        null,
  subdomains:     null
};

var OPACITY_FILTER = "progid:DXImageTransform.Microsoft.gradient(startColorstr=#00FFFFFF,endColorstr=#00FFFFFF)";

var CartoDBNamedMap = function(opts) {

  this.options = _.defaults(opts, default_options);
  this.tiles = 0;
  this.tilejson = null;
  this.interaction = [];

  if (!opts.named_map && !opts.sublayers) {
      throw new Error('cartodb-gmaps needs at least the named_map');
  }

  // Add CartoDB logo
  if (this.options.cartodb_logo != false)
    cdb.geo.common.CartoDBLogo.addWadus({ left: 74, bottom:8 }, 2000, this.options.map.getDiv());

  wax.g.connector.call(this, opts);

  // lovely wax connector overwrites options so set them again
  // TODO: remove wax.connector here
   _.extend(this.options, opts);
  this.projector = new Projector(opts.map);
  NamedMap.call(this, this.options.named_map, this.options);
  CartoDBLayerCommon.call(this);
  // precache
  this.update();
};


var CartoDBLayerGroup = function(opts) {

  this.options = _.defaults(opts, default_options);
  this.tiles = 0;
  this.tilejson = null;
  this.interaction = [];

  if (!opts.layer_definition && !opts.sublayers) {
      throw new Error('cartodb-leaflet needs at least the layer_definition or sublayer list');
  }

  // if only sublayers is available, generate layer_definition from it
  if(!opts.layer_definition) {
    opts.layer_definition = LayerDefinition.layerDefFromSubLayers(opts.sublayers);
  }

  // Add CartoDB logo
  if (this.options.cartodb_logo != false)
    cdb.geo.common.CartoDBLogo.addWadus({ left: 74, bottom:8 }, 2000, this.options.map.getDiv());

  wax.g.connector.call(this, opts);

  // lovely wax connector overwrites options so set them again
  // TODO: remove wax.connector here
   _.extend(this.options, opts);
  this.projector = new Projector(opts.map);
  LayerDefinition.call(this, opts.layer_definition, this.options);
  CartoDBLayerCommon.call(this);
  // precache
  this.update();
};

function setImageOpacityIE8(img, opacity) {
    var v = Math.round(opacity*100);
    if (v >= 99) {
      img.style.filter = OPACITY_FILTER;
    } else {
      img.style.filter = "alpha(opacity=" + (opacity) + ");";
    }
}

function CartoDBLayerGroupBase() {}

CartoDBLayerGroupBase.prototype.setOpacity = function(opacity) {
  if (isNaN(opacity) || opacity > 1 || opacity < 0) {
    throw new Error(opacity + ' is not a valid value, should be in [0, 1] range');
  }
  this.opacity = this.options.opacity = opacity;
  for(var key in this.cache) {
    var img = this.cache[key];
    img.style.opacity = opacity;
    setImageOpacityIE8(img, opacity);
  }

};

CartoDBLayerGroupBase.prototype.setAttribution = function() {};

CartoDBLayerGroupBase.prototype.getTile = function(coord, zoom, ownerDocument) {
  var EMPTY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  var self = this;
  var ie = 'ActiveXObject' in window,
      ielt9 = ie && !document.addEventListener;

  this.options.added = true;

  if(this.tilejson === null) {
    var key = zoom + '/' + coord.x + '/' + coord.y;
    var i = this.cache[key] = new Image(256, 256);
    i.src = EMPTY_GIF;
    i.setAttribute('gTileKey', key);
    i.style.opacity = this.options.opacity;
    return i;
  }

  var im = wax.g.connector.prototype.getTile.call(this, coord, zoom, ownerDocument);

  // in IE8 semi transparency does not work and needs filter
  if( ielt9 ) {
    setImageOpacityIE8(im, this.options.opacity);
  }
  im.style.opacity = this.options.opacity;
  if (this.tiles === 0) {
    this.loading && this.loading();
  }

  this.tiles++;

  var loadTime = cartodb.core.Profiler.metric('cartodb-js.tile.png.load.time').start();

  var finished = function() {
    loadTime.end();
    self.tiles--;
    if (self.tiles === 0) {
      self.finishLoading && self.finishLoading();
    }
  };
  im.onload = finished;
  im.onerror = function() {
    cartodb.core.Profiler.metric('cartodb-js.tile.png.error').inc();
    finished();
  }

  return im;
};

CartoDBLayerGroupBase.prototype.onAdd = function () {
  //this.update();
};

CartoDBLayerGroupBase.prototype.clear = function () {
  this._clearInteraction();
  self.finishLoading && self.finishLoading();
};

CartoDBLayerGroupBase.prototype.update = function (done) {
  var self = this;
  this.loading && this.loading();
  this.getTiles(function(urls, err) {
    if(urls) {
      self.tilejson = urls;
      self.options.tiles = urls.tiles;
      self.tiles = 0;
      self.cache = {};
      self._reloadInteraction();
      self.refreshView();
      self.ok && self.ok();
      done && done();
    } else {
      self.error && self.error(err)
    }
  });
};

CartoDBLayerGroupBase.prototype.refreshView = function() {
  var self = this;
  var map = this.options.map;
  map.overlayMapTypes.forEach(
    function(layer, i) {
      if (layer == self) {
        map.overlayMapTypes.setAt(i, self);
        return;
      }
    }
  );
}
CartoDBLayerGroupBase.prototype.onLayerDefinitionUpdated = function() {
    this.update();
}

CartoDBLayerGroupBase.prototype._checkLayer = function() {
  if (!this.options.added) {
    throw new Error('the layer is not still added to the map');
  }
}

CartoDBLayerGroupBase.prototype._findPos = function (map,o) {
  var curleft = 0;
  var curtop = 0;
  var obj = map.getDiv();

  var x, y;
  if (o.e.changedTouches && o.e.changedTouches.length > 0) {
    x = o.e.changedTouches[0].clientX + window.scrollX;
    y = o.e.changedTouches[0].clientY + window.scrollY;
  } else {
    x = o.e.clientX;
    y = o.e.clientY;
  }

  // If the map is fixed at the top of the window, we can't use offsetParent
  // cause there might be some scrolling that we need to take into account.
  if (obj.offsetParent && obj.offsetTop > 0) {
    do {
      curleft += obj.offsetLeft;
      curtop += obj.offsetTop;
    } while (obj = obj.offsetParent);
    var point = this._newPoint(
      x - curleft, y - curtop);
  } else {
    var rect = obj.getBoundingClientRect();
    var scrollX = (window.scrollX || window.pageXOffset);
    var scrollY = (window.scrollY || window.pageYOffset);
    var point = this._newPoint(
      (o.e.clientX? o.e.clientX: x) - rect.left - obj.clientLeft - scrollX,
      (o.e.clientY? o.e.clientY: y) - rect.top - obj.clientTop - scrollY);
  }
  return point;
};

/**
 * Creates an instance of a google.maps Point
 */
CartoDBLayerGroupBase.prototype._newPoint = function(x, y) {
  return new google.maps.Point(x, y);
};

CartoDBLayerGroupBase.prototype._manageOffEvents = function(map, o){
  if (this.options.featureOut) {
    return this.options.featureOut && this.options.featureOut(o.e, o.layer);
  }
};


CartoDBLayerGroupBase.prototype._manageOnEvents = function(map,o) {
  var point  = this._findPos(map, o);
  var latlng = this.projector.pixelToLatLng(point);
  var event_type = o.e.type.toLowerCase();


  switch (event_type) {
    case 'mousemove':
      if (this.options.featureOver) {
        return this.options.featureOver(o.e,latlng, point, o.data, o.layer);
      }
      break;

    case 'click':
    case 'touchend':
    case 'touchmove': // for some reason android browser does not send touchend
    case 'mspointerup':
    case 'pointerup':
    case 'pointermove':
      if (this.options.featureClick) {
        this.options.featureClick(o.e,latlng, point, o.data, o.layer);
      }
      break;
    default:
      break;
  }
}

// CartoDBLayerGroup type
CartoDBLayerGroup.Projector = Projector;
CartoDBLayerGroup.prototype = new wax.g.connector();
_.extend(CartoDBLayerGroup.prototype, LayerDefinition.prototype, CartoDBLayerGroupBase.prototype, CartoDBLayerCommon.prototype);
CartoDBLayerGroup.prototype.interactionClass = wax.g.interaction;


// CartoDBNamedMap
CartoDBNamedMap.prototype = new wax.g.connector();
_.extend(CartoDBNamedMap.prototype, NamedMap.prototype, CartoDBLayerGroupBase.prototype, CartoDBLayerCommon.prototype);
CartoDBNamedMap.prototype.interactionClass = wax.g.interaction;


// export
cdb.geo.CartoDBLayerGroupGMaps = CartoDBLayerGroup;
cdb.geo.CartoDBNamedMapGMaps = CartoDBNamedMap;

/*
 *
 *  cartodb layer group view
 *
 */

function LayerGroupView(base) {
  var GMapsCartoDBLayerGroupView = function(layerModel, gmapsMap) {
    var self = this;
    var hovers = [];

    _.bindAll(this, 'featureOut', 'featureOver', 'featureClick');

    var opts = _.clone(layerModel.attributes);

    opts.map =  gmapsMap;

    var // preserve the user's callbacks
    _featureOver  = opts.featureOver,
    _featureOut   = opts.featureOut,
    _featureClick = opts.featureClick;

    var previousEvent;
    var eventTimeout = -1;

    opts.featureOver  = function(e, latlon, pxPos, data, layer) {
      if (!hovers[layer]) {
        self.trigger('layerenter', e, latlon, pxPos, data, layer);
      }
      hovers[layer] = 1;
      _featureOver  && _featureOver.apply(this, arguments);
      self.featureOver  && self.featureOver.apply(this, arguments);

      // if the event is the same than before just cancel the event
      // firing because there is a layer on top of it
      if (e.timeStamp === previousEvent) {
        clearTimeout(eventTimeout);
      }
      eventTimeout = setTimeout(function() {
        self.trigger('mouseover', e, latlon, pxPos, data, layer);
        self.trigger('layermouseover', e, latlon, pxPos, data, layer);
      }, 0);
      previousEvent = e.timeStamp;
    };

    opts.featureOut  = function(m, layer) {
      if (hovers[layer]) {
        self.trigger('layermouseout', layer);
      }
      hovers[layer] = 0;
      if(!_.any(hovers)) {
        self.trigger('mouseout');
      }
      _featureOut  && _featureOut.apply(this, arguments);
      self.featureOut  && self.featureOut.apply(this, arguments);
    };

    opts.featureClick  = _.debounce(function() {
      _featureClick  && _featureClick.apply(this, arguments);
      self.featureClick  && self.featureClick.apply(opts, arguments);
    }, 10);

    
    //CartoDBLayerGroup.call(this, opts);
    base.call(this, opts);
    cdb.geo.GMapsLayerView.call(this, layerModel, this, gmapsMap);
  };

  _.extend(
    GMapsCartoDBLayerGroupView.prototype,
    cdb.geo.GMapsLayerView.prototype,
    base.prototype,
    {

    _update: function() {
      this.setOptions(this.model.attributes);
    },

    reload: function() {
      this.model.invalidate();
    },

    remove: function() {
      cdb.geo.GMapsLayerView.prototype.remove.call(this);
      this.clear();
    },

    featureOver: function(e, latlon, pixelPos, data, layer) {
      // dont pass gmaps LatLng
      this.trigger('featureOver', e, [latlon.lat(), latlon.lng()], pixelPos, data, layer);
    },

    featureOut: function(e, layer) {
      this.trigger('featureOut', e, layer);
    },

    featureClick: function(e, latlon, pixelPos, data, layer) {
      // dont pass leaflet lat/lon
      this.trigger('featureClick', e, [latlon.lat(), latlon.lng()], pixelPos, data, layer);
    },

    error: function(e) {
      if(this.model) {
        //trigger the error form _checkTiles in the model
        this.model.trigger('error', e?e.errors:'unknown error');
        this.model.trigger('tileError', e?e.errors:'unknown error');
      }
    },

    ok: function(e) {
      this.model.trigger('tileOk');
    },

    tilesOk: function(e) {
      this.model.trigger('tileOk');
    },

    loading: function() {
      this.trigger("loading");
    },

    finishLoading: function() {
      this.trigger("load");
    }


  });
  return GMapsCartoDBLayerGroupView;
}

cdb.geo.GMapsCartoDBLayerGroupView = LayerGroupView(CartoDBLayerGroup);
cdb.geo.GMapsCartoDBNamedMapView = LayerGroupView(CartoDBNamedMap);

cdb.geo.CartoDBNamedMapGMaps = CartoDBNamedMap;
/**
* gmaps cartodb layer
*/

})();

},{}],23:[function(require,module,exports){

(function() {

if(typeof(google) == "undefined" || typeof(google.maps) == "undefined") 
  return;

var GMapsPlainLayerView = function(layerModel, gmapsMap) {
  this.color = layerModel.get('color')
  cdb.geo.GMapsLayerView.call(this, layerModel, this, gmapsMap);
};

_.extend(
  GMapsPlainLayerView.prototype,
  cdb.geo.GMapsLayerView.prototype, {

  _update: function() {
    this.color = this.model.get('color')
    this.refreshView();
  },

  getTile: function(coord, zoom, ownerDocument) {
      var div = document.createElement('div');
      div.style.width = this.tileSize.x;
      div.style.height = this.tileSize.y;
      div['background-color'] = this.color;
      return div;
  },

  tileSize: new google.maps.Size(256,256),
  maxZoom: 100,
  minZoom: 0,
  name:"plain layer",
  alt: "plain layer"
});

cdb.geo.GMapsPlainLayerView = GMapsPlainLayerView;

})();

},{}],24:[function(require,module,exports){

(function() {

if(typeof(google) == "undefined" || typeof(google.maps) == "undefined") 
  return;

// TILED LAYER
var GMapsTiledLayerView = function(layerModel, gmapsMap) {
  cdb.geo.GMapsLayerView.call(this, layerModel, this, gmapsMap);
  this.tileSize = new google.maps.Size(256, 256);
  this.opacity = 1.0;
  this.isPng = true;
  this.maxZoom = 22;
  this.minZoom = 0;
  this.name= 'cartodb tiled layer';
  google.maps.ImageMapType.call(this, this);
};

_.extend(
  GMapsTiledLayerView.prototype,
  cdb.geo.GMapsLayerView.prototype,
  google.maps.ImageMapType.prototype, {

    getTileUrl: function(tile, zoom) {
      var y = tile.y;
      var tileRange = 1 << zoom;
      if (y < 0 || y  >= tileRange) {
        return null;
      }
      var x = tile.x;
      if (x < 0 || x >= tileRange) {
        x = (x % tileRange + tileRange) % tileRange;
      }
      if(this.model.get('tms')) {
        y = tileRange - y - 1;
      }
      var urlPattern = this.model.get('urlTemplate');
      return urlPattern
                  .replace("{x}",x)
                  .replace("{y}",y)
                  .replace("{z}",zoom);
    }
});

cdb.geo.GMapsTiledLayerView = GMapsTiledLayerView;


})();

},{}],25:[function(require,module,exports){
/**
 * Wrapper for map properties returned by the tiler
 */
function MapProperties(mapProperties) {
  this.mapProperties = mapProperties;
}

MapProperties.prototype.getMapId = function() {
  return this.mapProperties.layergroupid;
}

/**
 * Returns the index of a layer of a given type, as the tiler kwows it.
 *
 * @param {integer} index - number of layer of the specified type
 * @param {string} layerType - type of the layers
 */
MapProperties.prototype.getLayerIndexByType = function(index, layerType) {
  var layers = this.mapProperties.metadata && this.mapProperties.metadata.layers;

  if (!layers) {
    return index;
  }

  var tilerLayerIndex = {}
  var j = 0;
  for (var i = 0; i < layers.length; i++) {
    if (layers[i].type == layerType) {
      tilerLayerIndex[j] = i;
      j++;
    }
  }
  if (tilerLayerIndex[index] == undefined) {
    return -1;
  }
  return tilerLayerIndex[index];
}

/**
 * Returns the index of a layer of a given type, as the tiler kwows it.
 *
 * @param {string|array} types - Type or types of layers
 */
MapProperties.prototype.getLayerIndexesByType = function(types) {
  var layers = this.mapProperties.metadata && this.mapProperties.metadata.layers;

  if (!layers) {
    return;
  }
  var layerIndexes = [];
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    var isValidType = layer.type !== 'torque';
    if (types && types.length > 0) {
      isValidType = isValidType && types.indexOf(layer.type) != -1
    }
    if (isValidType) {
      layerIndexes.push(i);
    }
  }
  return layerIndexes;
}

function MapBase(options) {
  var self = this;

  this.options = _.defaults(options, {
    ajax: window.$ ? window.$.ajax : reqwest.compat,
    pngParams: ['map_key', 'api_key', 'cache_policy', 'updated_at'],
    gridParams: ['map_key', 'api_key', 'cache_policy', 'updated_at'],
    cors: cdb.core.util.isCORSSupported(),
    MAX_GET_SIZE: 2033,
    force_cors: false,
    instanciateCallback: function() {
      return '_cdbc_' + self._callbackName();
    }
  });

  this.mapProperties = null;
  this.urls = null;
  this.silent = false;
  this.interactionEnabled = []; //TODO: refactor, include inside layer
  this._timeout = -1;
  this._createMapCallsStack = [];
  this._createMapCallbacks = [];
  this._waiting = false;
  this.lastTimeUpdated = null;
  this._refreshTimer = -1;

  // build template url
  if (!this.options.maps_api_template) {
    this._buildMapsApiTemplate(this.options);
  }
}

MapBase.BASE_URL = '/api/v1/map';
MapBase.EMPTY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

MapBase.prototype = {

  _buildMapsApiTemplate: function(opts) {
    var tilerProtocol = opts.tiler_protocol;
    var tilerDomain = opts.tiler_domain;
    var tilerPort = (opts.tiler_port != "") ? (":" + opts.tiler_port) : "";
    var username = opts.user_name ? "{user}." : "";
    opts.maps_api_template = [tilerProtocol, "://", username, tilerDomain, tilerPort].join('');
  },

  createMap: function(callback) {
    var self = this;
    function invokeStackedCallbacks(data, err) {
      var fn;
      while(fn = self._createMapCallbacks.pop()) {
        fn(data, err);
      }
    }
    clearTimeout(this._timeout);
    this._createMapCallsStack.push(invokeStackedCallbacks);
    this._createMapCallbacks.push(callback);
    this._timeout = setTimeout(function() {
      self._createMap(invokeStackedCallbacks);
    }, 4);
  },

  _createMap: function(callback) {
    var self = this;
    callback = callback || function() {};

    // if the previous request didn't finish, queue it
    if(this._waiting) {
      return this;
    }

    this._createMapCallsStack = [];

    // when it's a named map the number of layers is not known
    // so fetch the map
    if (!this.named_map && this.visibleLayers().length === 0) {
      callback(null);
      return;
    }

    // mark as the request is being done
    this._waiting = true;
    var req = null;
    if (this._usePOST()) {
      req = this._requestPOST;
    } else {
      req = this._requestGET;
    }
    var params = this._getParamsFromOptions(this.options);
    req.call(this, params, callback);
    return this;
  },

  _getParamsFromOptions: function(options) {
    var params = [];
    var extra_params = options.extra_params || {};
    var api_key = options.map_key || options.api_key || extra_params.map_key || extra_params.api_key;

    if(api_key) {
      params.push("map_key=" + api_key);
    }

    if(extra_params.auth_token) {
      if (_.isArray(extra_params.auth_token)) {
        for (var i = 0, len = extra_params.auth_token.length; i < len; i++) {
          params.push("auth_token[]=" + extra_params.auth_token[i]);
        }
      } else {
        params.push("auth_token=" + extra_params.auth_token);
      }
    }

    if (this.stat_tag) {
      params.push("stat_tag=" + this.stat_tag);
    }
    return params;
  },

  _usePOST: function() {
    if (this.options.cors) {
      if (this.options.force_cors) {
        return true;
      }
      // check payload size
      var payload = JSON.stringify(this.toJSON());
      if (payload.length > this.options.MAX_GET_SIZE) {
        return true;
      }
    }
    return false;
  },

  _requestPOST: function(params, callback) {
    var self = this;
    var ajax = this.options.ajax;

    var loadingTime = cartodb.core.Profiler.metric('cartodb-js.layergroup.post.time').start();

    ajax({
      crossOrigin: true,
      type: 'POST',
      method: 'POST',
      dataType: 'json',
      contentType: 'application/json',
      url: this._tilerHost() + this.endPoint + (params.length ? "?" + params.join('&'): ''),
      data: JSON.stringify(this.toJSON()),
      success: function(data) {
        loadingTime.end();
        // discard previous calls when there is another call waiting
        if(0 === self._createMapCallsStack.length) {
          if (data.errors) {
            cartodb.core.Profiler.metric('cartodb-js.layergroup.post.error').inc();
            callback(null, data);
          } else {
            callback(data);
          }
        }

        self._requestFinished();
      },
      error: function(xhr) {
        loadingTime.end();
        cartodb.core.Profiler.metric('cartodb-js.layergroup.post.error').inc();
        var err = { errors: ['unknow error'] };
        if (xhr.status === 0) {
          err = { errors: ['connection error'] };
        }
        try {
          err = JSON.parse(xhr.responseText);
        } catch(e) {}
        if(0 === self._createMapCallsStack.length) {
          callback(null, err);
        }
        self._requestFinished();
      }
    });
  },

  _requestGET: function(params, callback) {
    var self = this;
    var ajax = this.options.ajax;
    var json = JSON.stringify(this.toJSON());
    var compressor = this._getCompressor(json);
    var endPoint = self.JSONPendPoint || self.endPoint;
    compressor(json, 3, function(encoded) {
      params.push(encoded);
      var loadingTime = cartodb.core.Profiler.metric('cartodb-js.layergroup.get.time').start();
      var host = self.options.dynamic_cdn ? self._host(): self._tilerHost();
      ajax({
        dataType: 'jsonp',
        url: host + endPoint + '?' + params.join('&'),
        jsonpCallback: self.options.instanciateCallback,
        cache: !!self.options.instanciateCallback,
        success: function(data) {
          loadingTime.end();
          if(0 === self._createMapCallsStack.length) {
            // check for errors
            if (data.errors) {
              cartodb.core.Profiler.metric('cartodb-js.layergroup.get.error').inc();
              callback(null, data);
            } else {
              callback(data);
            }
          }
          self._requestFinished();
        },
        error: function(data) {
          loadingTime.end();
          cartodb.core.Profiler.metric('cartodb-js.layergroup.get.error').inc();
          var err = { errors: ['unknow error'] };
          try {
            err = JSON.parse(xhr.responseText);
          } catch(e) {}
          if(0 === self._createMapCallsStack.length) {
            callback(null, err);
          }
          self._requestFinished();
        }
      });
    });
  },

  // returns the compressor depending on the size
  // of the layer
  _getCompressor: function(payload) {
    var self = this;
    if (this.options.compressor) {
      return this.options.compressor;
    }

    payload = payload || JSON.stringify(this.toJSON());
    if (!this.options.force_compress && payload.length < this.options.MAX_GET_SIZE) {
      return function(data, level, callback) {
        callback("config=" + encodeURIComponent(data));
      };
    }

    return function(data, level, callback) {
      data = JSON.stringify({ config: data });
      LZMA.compress(data, level, function(encoded) {
        callback("lzma=" + encodeURIComponent(cdb.core.util.array2hex(encoded)));
      });
    };

  },

  _requestFinished: function() {
    var self = this;
    this._waiting = false;
    this.lastTimeUpdated = new Date().getTime();

    // refresh layer when invalidation time has passed
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(function() {
      self.invalidate();
    }, this.options.refreshTime || (60*120*1000)); // default layergroup ttl

    // check request queue
    if(this._createMapCallsStack.length) {
      var request = this._createMapCallsStack.pop();
      this._createMap(request);
    }
  },

  fetchAttributes: function(layer_index, feature_id, columnNames, callback) {
    this._attrCallbackName = this._attrCallbackName || this._callbackName();
    var ajax = this.options.ajax;
    var loadingTime = cartodb.core.Profiler.metric('cartodb-js.named_map.attributes.time').start();
    ajax({
      dataType: 'jsonp',
      url: this._attributesUrl(layer_index, feature_id),
      jsonpCallback: '_cdbi_layer_attributes_' + this._attrCallbackName,
      cache: true,
      success: function(data) {
        loadingTime.end();
        callback(data);
      },
      error: function(data) {
        loadingTime.end();
        cartodb.core.Profiler.metric('cartodb-js.named_map.attributes.error').inc();
        callback(null);
      }
    });
  },

  _callbackName: function() {
    return cdb.core.util.uniqueCallbackName(JSON.stringify(this.toJSON()));
  },

  _attributesUrl: function(layer, feature_id) {
    var host = this._host();
    var url = [
      host,
      MapBase.BASE_URL.slice(1),
      this.mapProperties.getMapId(),
      this.mapProperties.getLayerIndexByType(this.getLayerIndexByNumber(layer), "mapnik"),
      'attributes',
      feature_id].join('/');

    var extra_params = this.options.extra_params || {};
    var token = extra_params.auth_token;
    if (token) {
      if (_.isArray(token)) {
        var tokenParams = [];
        for (var i = 0, len = token.length; i < len; i++) {
          tokenParams.push("auth_token[]=" + token[i]);
        }
        url += "?" + tokenParams.join('&')
      } else {
        url += "?auth_token=" + token
      }
    }
    return url;
  },

  invalidate: function() {
    this.mapProperties = null;
    this.urls = null;
    this.onLayerDefinitionUpdated();
  },

  getTiles: function(callback) {
    var self = this;
    if(self.mapProperties) {
      callback && callback(self._layerGroupTiles(self.mapProperties, self.options.extra_params));
      return this;
    }
    this.createMap(function(data, err) {
      if(data) {
        self.mapProperties = new MapProperties(data);
        // if cdn_url is present, use it
        if (data.cdn_url) {
          self.options.cdn_url = self.options.cdn_url || {}
          self.options.cdn_url = {
            http: data.cdn_url.http || self.options.cdn_url.http,
            https: data.cdn_url.https || self.options.cdn_url.https
          }
        }
        self.urls = self._layerGroupTiles(self.mapProperties, self.options.extra_params);
        callback && callback(self.urls);
      } else {
        if ((self.named_map !== null) && (err) ){
          callback && callback(null, err);
        } else if (self.visibleLayers().length === 0) {
          callback && callback({
            tiles: [MapBase.EMPTY_GIF],
            grids: []
          });
          return;
        } 
      }
    });
    return this;
  },

  isHttps: function() {
    return this.options.maps_api_template.indexOf('https') === 0;
  },

  _layerGroupTiles: function(mapProperties, params) {
    var grids = [];
    var tiles = [];
    var pngParams = this._encodeParams(params, this.options.pngParams);
    var gridParams = this._encodeParams(params, this.options.gridParams);
    var subdomains = this.options.subdomains || ['0', '1', '2', '3'];
    if(this.isHttps()) {
      subdomains = [null]; // no subdomain
    }

    var layerIndexes = mapProperties.getLayerIndexesByType(this.options.filter);
    if (layerIndexes.length) {
      var tileTemplate = '/' +  layerIndexes.join(',') +'/{z}/{x}/{y}';
      var gridTemplate = '/{z}/{x}/{y}';

      for(var i = 0; i < subdomains.length; ++i) {
        var s = subdomains[i];
        var cartodb_url = this._host(s) + MapBase.BASE_URL + '/' + mapProperties.getMapId();
        tiles.push(cartodb_url + tileTemplate + ".png" + (pngParams ? "?" + pngParams: '') );

        for(var layer = 0; layer < this.layers.length; ++layer) {
          var index = mapProperties.getLayerIndexByType(layer, "mapnik");
          grids[layer] = grids[layer] || [];
          grids[layer].push(cartodb_url + "/" + index +  gridTemplate + ".grid.json" + (gridParams ? "?" + gridParams: ''));
        }
      }
    } else {
      tiles = [MapBase.EMPTY_GIF];
    }

    return {
      tiles: tiles,
      grids: grids
    }
  },

  /**
   * Change query of the tiles
   * @params {str} New sql for the tiles
   */
  _encodeParams: function(params, included) {
    if(!params) return '';
    var url_params = [];
    included = included || _.keys(params);
    for(var i in included) {
      var k = included[i]
      var p = params[k];
      if(p) {
        if (_.isArray(p)) {
          for (var j = 0, len = p.length; j < len; j++) {
            url_params.push(k + "[]=" + encodeURIComponent(p[j]));
          }
        } else {
          var q = encodeURIComponent(p);
          q = q.replace(/%7Bx%7D/g,"{x}").replace(/%7By%7D/g,"{y}").replace(/%7Bz%7D/g,"{z}");
          url_params.push(k + "=" + q);
        }
      }
    }
    return url_params.join('&')
  },

  onLayerDefinitionUpdated: function() {},

  setSilent: function(b) {
    this.silent = b;
  },

  _definitionUpdated: function() {
    if(this.silent) return;
    this.invalidate();
  },

  /**
   * get tile json for layer
   */
  getTileJSON: function(layer, callback) {
    layer = layer == undefined ? 0: layer;
    var self = this;
    this.getTiles(function(urls) {
      if(!urls) {
        callback(null);
        return;
      }
      if(callback) {
        callback(self._tileJSONfromTiles(layer, urls));
      }
    });
  },

  _tileJSONfromTiles: function(layer, urls, options) {
    options = options || {};
    var subdomains = options.subdomains || ['0', '1', '2', '3'];

    function replaceSubdomain(t) {
      var tiles = [];
      for (var i = 0; i < t.length; ++i) {
        tiles.push(t[i].replace('{s}', subdomains[i % subdomains.length]));
      }
      return tiles;
    }

    return {
      tilejson: '2.0.0',
      scheme: 'xyz',
      grids: replaceSubdomain(urls.grids[layer]),
      tiles: replaceSubdomain(urls.tiles),
      formatter: function(options, data) { return data; }
     };
  },

  _tilerHost: function() {
    var opts = this.options;
    return opts.maps_api_template.replace('{user}', opts.user_name);
  },

  _host: function(subhost) {
    var opts = this.options;
    var cdn_host = opts.cdn_url;
    var has_empty_cdn = !cdn_host || (cdn_host && (!cdn_host.http && !cdn_host.https));

    if (opts.no_cdn || has_empty_cdn) {
      return this._tilerHost();
    } else {
      var protocol = this.isHttps() ? 'https': 'http';
      var h = protocol + "://";
      if (subhost) {
        h += subhost + ".";
      }

      var cdn_url = cdn_host[protocol];
      // build default template url if the cdn url is not templatized
      // this is for backwards compatiblity, ideally we should use the url
      // that tiler sends to us right away
      if (!this._isUserTemplateUrl(cdn_url)) {
        cdn_url = cdn_url  + "/{user}";
      }
      h += cdn_url.replace('{user}', opts.user_name)

      return h;
    }
  },

  _isUserTemplateUrl: function(t) {
    return t && t.indexOf('{user}') !== -1;
  },

  // Methods to operate with layers
  getLayer: function(index) {
    return _.clone(this.layers[index]);
  },

  getLayerCount: function() {
    return this.layers ? this.layers.length: 0;
  },

  // given number inside layergroup 
  // returns the real index in tiler layergroup`
  getLayerIndexByNumber: function(number) {
    var layers = {}
    var c = 0;
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      layers[i] = c;
      if(layer.options && !layer.options.hidden) {
        ++c;
      }
    }
    return layers[number];
  },

  /**
   * return the layer number by index taking into
   * account the hidden layers.
   */
  getLayerNumberByIndex: function(index) {
    var layers = [];
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      if(this._isLayerVisible(layer)) {
        layers.push(i);
      }
    }
    if (index >= layers.length) {
      return -1;
    }
    return +layers[index];
  },

  visibleLayers: function() {
    var layers = [];
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      if (this._isLayerVisible(layer)) {
        layers.push(layer);
      }
    }
    return layers;
  },

  _isLayerVisible: function(layer) {
    if (layer.options && 'hidden' in layer.options) {
      return !layer.options.hidden;
    }

    return layer.visible !== false;
  },

  setLayer: function(layer, def) {
    if(layer < this.getLayerCount() && layer >= 0) {
      if (def.options.hidden) {
        var i = this.interactionEnabled[layer];
        if (i) {
          def.interaction = true
          this.setInteraction(layer, false);
        }
      } else {
        if (this.layers[layer].interaction) {
          this.setInteraction(layer, true);
          delete this.layers[layer].interaction;
        }
      }
      this.layers[layer] = _.clone(def);
    }
    this.invalidate();
    return this;
  },

  getTooltipData: function(layer) {
    var tooltip = this.layers[layer].tooltip;
    if (tooltip && tooltip.fields && tooltip.fields.length) {
      return tooltip;
    }
    return null;
  },

  getInfowindowData: function(layer) {
    var lyr;
    var infowindow = this.layers[layer].infowindow;
    if (!infowindow && this.options.layer_definition && (lyr = this.options.layer_definition.layers[layer])) {
      infowindow = lyr.infowindow;
    }
    if (infowindow && infowindow.fields && infowindow.fields.length > 0) {
      return infowindow;
    }
    return null;
  },

  containInfowindow: function() {
    var layers =  this.options.layer_definition.layers;
    for(var i = 0; i < layers.length; ++i) {
      var infowindow = layers[i].infowindow;
      if (infowindow && infowindow.fields && infowindow.fields.length > 0) {
        return true;
      }
    }
    return false;
  },

  containTooltip: function() {
    var layers =  this.options.layer_definition.layers;
    for(var i = 0; i < layers.length; ++i) {
      var tooltip = layers[i].tooltip;
      if (tooltip && tooltip.fields && tooltip.fields.length) {
        return true;
      }
    }
    return false;
  },

  getSubLayer: function(index) {
    var layer = this.layers[index];
    layer.sub = layer.sub || SubLayerFactory.createSublayer(layer.type, this, index);
    return layer.sub;
  },

  getSubLayerCount: function() {
    return this.getLayerCount();
  },

  getSubLayers: function() {
    var layers = []
    for (var i = 0; i < this.getSubLayerCount(); ++i) {
      layers.push(this.getSubLayer(i))
    }
    return layers;
  }
};

// TODO: This is actually an AnonymousMap -> Rename?
function LayerDefinition(layerDefinition, options) {
  MapBase.call(this, options);
  this.endPoint = MapBase.BASE_URL;
  this.setLayerDefinition(layerDefinition, { silent: true });
}

/**
 * Generates the MapConfig definition for a list of sublayers.
 *
 * ``sublayers`` should be an array, an exception is thrown otherwise.
 *
 */
LayerDefinition.layerDefFromSubLayers = function(sublayers) {

  if(!sublayers || sublayers.length === undefined) throw new Error("sublayers should be an array");

  sublayers = _.map(sublayers, function(sublayer) {
    var type = sublayer.type;
    delete sublayer.type;
    return {
      type: type,
      options: sublayer
    }
  });

  var layerDefinition = {
    version: '1.3.0',
    stat_tag: 'API',
    layers: sublayers
  }

  return new LayerDefinition(layerDefinition, {}).toJSON();
};

LayerDefinition.prototype = _.extend({}, MapBase.prototype, {

  setLayerDefinition: function(layerDefinition, options) {
    options = options || {};
    this.version = layerDefinition.version || '1.0.0';
    this.stat_tag = layerDefinition.stat_tag;
    this.layers = _.clone(layerDefinition.layers);
    if(!options.silent) {
      this._definitionUpdated();
    }
  },

  toJSON: function() {
    var obj = {};
    obj.version = this.version;
    if(this.stat_tag) {
      obj.stat_tag = this.stat_tag;
    }
    obj.layers = [];
    var layers = this.visibleLayers();
    for(var i = 0; i < layers.length; ++i) {
      var sublayer = this.getSubLayer(this.getLayerNumberByIndex(i));
      obj.layers.push(sublayer.toJSON());
    }
    return obj;
  },

  removeLayer: function(layer) {
    if(layer < this.getLayerCount() && layer >= 0) {
      this.layers.splice(layer, 1);
      this.interactionEnabled.splice(layer, 1);
      this._reorderSubLayers();
      this.invalidate();
    }
    return this;
  },

  _reorderSubLayers: function() {
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      if(layer.sub) {
        layer.sub._setPosition(i);
      }
    }
  },

  addLayer: function(def, index) {
    index = index === undefined ? this.getLayerCount(): index;
    if(index <= this.getLayerCount() && index >= 0) {

      var type = def.type || 'cartodb';
      delete def.type;

      this.layers.splice(index, 0, {
        type: type,
        options: def
      });

      var sublayer = this.getSubLayer(index);
      if (sublayer.isValid()) {
        this._definitionUpdated();
      } else { // Remove it from the definition
        sublayer.remove();
        throw 'Layer definition should contain all the required attributes';
      }
    }
    return this;
  },

  /**
   * set interactivity attributes for a layer.
   * if attributes are passed as first param layer 0 is
   * set
   */
  setInteractivity: function(layer, attributes) {
    if(attributes === undefined) {
      attributes = layer;
      layer = 0;
    }

    if(layer >= this.getLayerCount() && layer < 0) {
      throw new Error("layer does not exist");
    }

    if(typeof(attributes) == 'string') {
      attributes = attributes.split(',');
    }

    for(var i = 0; i < attributes.length; ++i) {
      attributes[i] = attributes[i].replace(/ /g, '');
    }

    this.layers[layer].options.interactivity = attributes;
    this._definitionUpdated();
    return this;
  },

  setQuery: function(layer, sql) {
    if(sql === undefined) {
      sql = layer;
      layer = 0;
    }
    this.layers[layer].options.sql = sql
    this._definitionUpdated();
  },

  getQuery: function(layer) {
    layer = layer || 0;
    return this.layers[layer].options.sql
  },

  /**
   * Change style of the tiles
   * @params {style} New carto for the tiles
   */
  setCartoCSS: function(layer, style, version) {
    if(version === undefined) {
      version = style;
      style = layer;
      layer = 0;
    }

    version = version || cartodb.CARTOCSS_DEFAULT_VERSION;

    this.layers[layer].options.cartocss = style;
    this.layers[layer].options.cartocss_version = version;
    this._definitionUpdated();
  },

  /**
   * adds a new sublayer to the layer with the sql and cartocss params
   */
  createSubLayer: function(attrs, options) {
    this.addLayer(attrs);
    return this.getSubLayer(this.getLayerCount() - 1);
  }
});

function NamedMap(named_map, options) {
  MapBase.call(this, options);
  this.options.pngParams.push('auth_token')
  this.options.gridParams.push('auth_token')
  this.setLayerDefinition(named_map, options)
  this.stat_tag = named_map.stat_tag;
}

NamedMap.prototype = _.extend({}, MapBase.prototype, {

  getSubLayer: function(index) {
    var layer = this.layers[index];
    // for named maps we don't know how many layers are defined so
    // we create the layer on the fly
    if (!layer) {
      layer = this.layers[index] = {
        options: {}
      };
    }
    layer.sub = layer.sub || SubLayerFactory.createSublayer(layer.type, this, index);
    return layer.sub;
  },

  setLayerDefinition: function(named_map, options) {
    options = options || {}
    this.endPoint = MapBase.BASE_URL + '/named/' + named_map.name;
    this.JSONPendPoint = MapBase.BASE_URL + '/named/' + named_map.name + '/jsonp';
    this.layers = _.clone(named_map.layers) || [];
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      layer.options = layer.options || { 'hidden': layer.visible === false };
      layer.options.layer_name = layer.layer_name;
    }
    this.named_map = named_map;
    var token = named_map.auth_token || options.auth_token;
    if (token) {
      this.setAuthToken(token);
    }
    if(!options.silent) {
      this.invalidate();
    }
  },

  setAuthToken: function(token) {
    if(!this.isHttps()) {
      throw new Error("https must be used when map has token authentication");
    }
    this.options.extra_params = this.options.extra_params || {};
    this.options.extra_params.auth_token = token;
    this.invalidate();
    return this;
  },

  setParams: function(attr, v) {
    var params;
    if (arguments.length === 2) {
      params = {}
      params[attr] = v;
    } else {
      params = attr;
    }
    if (!this.named_map.params) {
      this.named_map.params = {};
    }
    for (var k in params) {
      if (params[k] === undefined || params[k] === null) {
        delete this.named_map.params[k];
      } else {
        this.named_map.params[k] = params[k];
      }
    }
    this.invalidate();
    return this;
  },

  toJSON: function() {
    var payload = this.named_map.params || {};
    for(var i = 0; i < this.layers.length; ++i) {
      var layer = this.layers[i];
      payload['layer' + i] = this._isLayerVisible(layer) ? 1 : 0;
    }
    return payload;
  },

  containInfowindow: function() {
    var layers = this.layers || [];
    for(var i = 0; i < layers.length; ++i) {
      var infowindow = layers[i].infowindow;
      if (infowindow && infowindow.fields && infowindow.fields.length > 0) {
        return true;
      }
    }
    return false;
  },

  containTooltip: function() {
    var layers = this.layers || [];
    for(var i = 0; i < layers.length; ++i) {
      var tooltip = layers[i].tooltip;
      if (tooltip) {
        return true;
      }
    }
    return false;
  },

  setSQL: function(sql) {
    throw new Error("SQL is read-only in NamedMaps");
  },

  setCartoCSS: function(sql) {
    throw new Error("cartocss is read-only in NamedMaps");
  },

  getCartoCSS: function() {
    throw new Error("cartocss can't be accessed in NamedMaps");
  },

  getSQL: function() {
    throw new Error("SQL can't be accessed in NamedMaps");
  },

  setLayer: function(layer, def) {
    var not_allowed_attrs = {'sql': 1, 'cartocss': 1, 'interactivity': 1 };

    for(var k in def.options) {
      if (k in not_allowed_attrs) {
        delete def.options[k];
        throw new Error( k + " is read-only in NamedMaps");
      }
    }
    return MapBase.prototype.setLayer.call(this, layer, def);
  },

  removeLayer: function(layer) {
    throw new Error("sublayers are read-only in Named Maps");
  },

  createSubLayer: function(attrs, options) {
    throw new Error("sublayers are read-only in Named Maps");
  },

  addLayer: function(def, layer) {
    throw new Error("sublayers are read-only in Named Maps");
  },

  // for named maps the layers are always the same (i.e they are
  // not removed to hide) so the number does not change
  getLayerIndexByNumber: function(number) {
    return +number;
  }
});


},{}],26:[function(require,module,exports){
(function() {

/**
 * this module implements all the features related to overlay geometries
 * in leaflet: markers, polygons, lines and so on
 */


/**
 * view for markers
 */
function PointView(geometryModel) {
  var self = this;
  // events to link
  var events = [
    'click',
    'dblclick',
    'mousedown',
    'mouseover',
    'mouseout',
    'dragstart',
    'drag',
    'dragend'
  ];

  this._eventHandlers = {};
  this.model = geometryModel;
  this.points = [];

  var icon = {
    iconUrl: this.model.get('iconUrl') || cdb.config.get('assets_url') + '/images/layout/default_marker.png',
    iconAnchor: this.model.get('iconAnchor') || [11, 11]
  };

  this.geom = L.GeoJSON.geometryToLayer(geometryModel.get('geojson'), function(geojson, latLng) {
      //TODO: create marker depending on the visualizacion options
      var p = L.marker(latLng, {
        icon: L.icon(icon)
      });

      var i;
      for(i = 0; i < events.length; ++i) {
        var e = events[i];
        p.on(e, self._eventHandler(e));
      }
      return p;
  });

  this.bind('dragend', function(e, pos) {
    geometryModel.set({
      geojson: {
        type: 'Point',
        //geojson is lng,lat
        coordinates: [pos[1], pos[0]]
      }
    });
  });
}

PointView.prototype = new GeometryView();

PointView.prototype.edit = function() {
  this.geom.dragging.enable();
};

/**
 * returns a function to handle events fot evtType
 */
PointView.prototype._eventHandler = function(evtType) {
  var self = this;
  var h = this._eventHandlers[evtType];
  if(!h) {
    h = function(e) {
      var latlng = e.target.getLatLng();
      var s = [latlng.lat, latlng.lng];
      self.trigger(evtType, e.originalEvent, s);
    };
    this._eventHandlers[evtType] = h;
  }
  return h;
};

/**
 * view for other geometries (polygons/lines)
 */
function PathView(geometryModel) {
  var self = this;
  // events to link
  var events = [
    'click',
    'dblclick',
    'mousedown',
    'mouseover',
    'mouseout',
  ];

  this._eventHandlers = {};
  this.model = geometryModel;
  this.points = [];


  this.geom = L.GeoJSON.geometryToLayer(geometryModel.get('geojson'));
  this.geom.setStyle(geometryModel.get('style'));


  /*for(var i = 0; i < events.length; ++i) {
    var e = events[i];
    this.geom.on(e, self._eventHandler(e));
  }*/

}

PathView.prototype = new GeometryView();

PathView.prototype._leafletLayers = function() {
  // check if this is a multi-feature or single-feature
  if (this.geom.getLayers) {
    return this.geom.getLayers();
  }
  return [this.geom];
};


PathView.prototype.enableEdit = function() {
  var self = this;
  var layers = this._leafletLayers();
  _.each(layers, function(g) {
    g.setStyle(self.model.get('style'));
    g.on('edit', function() {
      self.model.set('geojson', self.geom.toGeoJSON().geometry);
    }, self);
  });
};

PathView.prototype.disableEdit = function() {
  var self = this;
  var layers = this._leafletLayers();
  _.each(layers, function(g) {
    g.off('edit', null, self);
  });
};

PathView.prototype.edit = function(enable) {
  var self = this;
  var fn = enable ? 'enable': 'disable';
  var layers = this._leafletLayers();
  _.each(layers, function(g) {
    g.editing[fn]();
    enable ? self.enableEdit(): self.disableEdit();
  });
};

cdb.geo.leaflet = cdb.geo.leaflet || {};

cdb.geo.leaflet.PointView = PointView;
cdb.geo.leaflet.PathView = PathView;


})();

},{}],27:[function(require,module,exports){
/**
* leaflet implementation of a map
*/
(function() {

  if(typeof(L) == "undefined")
    return;

  /**
   * leatlef impl
   */
  cdb.geo.LeafletMapView = cdb.geo.MapView.extend({


    initialize: function() {

      _.bindAll(this, '_addLayer', '_removeLayer', '_setZoom', '_setCenter', '_setView');

      cdb.geo.MapView.prototype.initialize.call(this);

      var self = this;

      var center = this.map.get('center');

      var mapConfig = {
        zoomControl: false,
        center: new L.LatLng(center[0], center[1]),
        zoom: this.map.get('zoom'),
        minZoom: this.map.get('minZoom'),
        maxZoom: this.map.get('maxZoom')
      };


      if (this.map.get('bounding_box_ne')) {
        //mapConfig.maxBounds = [this.map.get('bounding_box_ne'), this.map.get('bounding_box_sw')];
      }

      if (!this.options.map_object) {

        this.map_leaflet = new L.Map(this.el, mapConfig);

        // remove the "powered by leaflet"
        this.map_leaflet.attributionControl.setPrefix('');

        if (this.map.get("scrollwheel") == false) this.map_leaflet.scrollWheelZoom.disable();
        if (this.map.get("keyboard") == false) this.map_leaflet.keyboard.disable();

      } else {

        this.map_leaflet = this.options.map_object;
        this.setElement(this.map_leaflet.getContainer());

        var c = self.map_leaflet.getCenter();

        self._setModelProperty({ center: [c.lat, c.lng] });
        self._setModelProperty({ zoom: self.map_leaflet.getZoom() });

        // unset bounds to not change mapbounds
        self.map.unset('view_bounds_sw', { silent: true });
        self.map.unset('view_bounds_ne', { silent: true });
      }

      this.map.bind('set_view', this._setView, this);
      this.map.layers.bind('add', this._addLayer, this);
      this.map.layers.bind('remove', this._removeLayer, this);
      this.map.layers.bind('reset', this._addLayers, this);
      this.map.layers.bind('change:type', this._swicthLayerView, this);

      this.map.geometries.bind('add', this._addGeometry, this);
      this.map.geometries.bind('remove', this._removeGeometry, this);

      this._bindModel();
      this._addLayers();
      this.setAttribution();

      this.map_leaflet.on('layeradd', function(lyr) {
        this.trigger('layeradd', lyr, self);
      }, this);

      this.map_leaflet.on('zoomstart', function() {
        self.trigger('zoomstart');
      });

      this.map_leaflet.on('click', function(e) {
        self.trigger('click', e.originalEvent, [e.latlng.lat, e.latlng.lng]);
      });

      this.map_leaflet.on('dblclick', function(e) {
        self.trigger('dblclick', e.originalEvent);
      });

      this.map_leaflet.on('zoomend', function() {
        self._setModelProperty({
          zoom: self.map_leaflet.getZoom()
        });
        self.trigger('zoomend');
      }, this);

      this.map_leaflet.on('move', function() {
        var c = self.map_leaflet.getCenter();
        self._setModelProperty({ center: [c.lat, c.lng] });
      });

      this.map_leaflet.on('dragend', function() {
        var c = self.map_leaflet.getCenter();
        this.trigger('dragend', [c.lat, c.lng]);
      }, this);

      this.map_leaflet.on('drag', function() {
        var c = self.map_leaflet.getCenter();
        self._setModelProperty({
          center: [c.lat, c.lng]
        });
        self.trigger('drag');
      }, this);

      this.map.bind('change:maxZoom', function() {
        L.Util.setOptions(self.map_leaflet, { maxZoom: self.map.get('maxZoom') });
      }, this);

      this.map.bind('change:minZoom', function() {
        L.Util.setOptions(self.map_leaflet, { minZoom: self.map.get('minZoom') });
      }, this);

      this.trigger('ready');

      // looks like leaflet dont like to change the bounds just after the inicialization
      var bounds = this.map.getViewBounds();

      if (bounds) {
        this.showBounds(bounds);
      }
    },

    // this replaces the default functionality to search for
    // already added views so they are not replaced
    _addLayers: function() {
      var self = this;

      var oldLayers = this.layers;
      this.layers = {};

      function findLayerView(layer) {
        var lv = _.find(oldLayers, function(layer_view) {
          var m = layer_view.model;
          return m.isEqual(layer);
        });
        return lv;
      }

      function canReused(layer) {
        return self.map.layers.find(function(m) {
          return m.isEqual(layer);
        });
      }

      // remove all
      for(var layer in oldLayers) {
        var layer_view = oldLayers[layer];
        if (!canReused(layer_view.model)) {
          layer_view.remove();
        }
      }

      this.map.layers.each(function(lyr) {
        var lv = findLayerView(lyr);
        if (!lv) {
          self._addLayer(lyr);
        } else {
          lv.setModel(lyr);
          self.layers[lyr.cid] = lv;
          self.trigger('newLayerView', lv, lv.model, self);
        }
      });

    },

    clean: function() {
      //see https://github.com/CloudMade/Leaflet/issues/1101
      L.DomEvent.off(window, 'resize', this.map_leaflet._onResize, this.map_leaflet);

      // remove layer views
      for(var layer in this.layers) {
        var layer_view = this.layers[layer];
        layer_view.remove();
        delete this.layers[layer];
      }

      // do not change by elder
      cdb.core.View.prototype.clean.call(this);
    },

    _setKeyboard: function(model, z) {
      if (z) {
        this.map_leaflet.keyboard.enable();
      } else {
        this.map_leaflet.keyboard.disable();
      }
    },

    _setScrollWheel: function(model, z) {
      if (z) {
        this.map_leaflet.scrollWheelZoom.enable();
      } else {
        this.map_leaflet.scrollWheelZoom.disable();
      }
    },

    _setZoom: function(model, z) {
      this._setView();
    },

    _setCenter: function(model, center) {
      this._setView();
    },

    _setView: function() {
      this.map_leaflet.setView(this.map.get("center"), this.map.get("zoom") || 0 );
    },

    _addGeomToMap: function(geom) {
      var geo = cdb.geo.LeafletMapView.createGeometry(geom);
      geo.geom.addTo(this.map_leaflet);
      return geo;
    },

    _removeGeomFromMap: function(geo) {
      this.map_leaflet.removeLayer(geo.geom);
    },

    createLayer: function(layer) {
      return cdb.geo.LeafletMapView.createLayer(layer, this.map_leaflet);
    },

    _addLayer: function(layer, layers, opts) {
      var self = this;
      var lyr, layer_view;
      layer_view = cdb.geo.LeafletMapView.createLayer(layer, this.map_leaflet);
      if (!layer_view) {
        return;
      }
      return this._addLayerToMap(layer_view, opts);
    },

    _addLayerToMap: function(layer_view, opts) {
      var layer = layer_view.model;

      this.layers[layer.cid] = layer_view;
      cdb.geo.LeafletMapView.addLayerToMap(layer_view, this.map_leaflet);

      // reorder layers
      for(var i in this.layers) {
        var lv = this.layers[i];
        lv.setZIndex(lv.model.get('order'));
      }

      if(opts === undefined || !opts.silent) {
        this.trigger('newLayerView', layer_view, layer_view.model, this);
      }
      return layer_view;
    },

    pixelToLatLon: function(pos) {
      var point = this.map_leaflet.containerPointToLatLng([pos[0], pos[1]]);
      return point;
    },

    latLonToPixel: function(latlon) {
      var point = this.map_leaflet.latLngToLayerPoint(new L.LatLng(latlon[0], latlon[1]));
      return this.map_leaflet.layerPointToContainerPoint(point);
    },

    // return the current bounds of the map view
    getBounds: function() {
      var b = this.map_leaflet.getBounds();
      var sw = b.getSouthWest();
      var ne = b.getNorthEast();
      return [
        [sw.lat, sw.lng],
        [ne.lat, ne.lng]
      ];
    },

    setAttribution: function() {
      var attributionControl = this._getAttributionControl();

      // Save the attributions that were in the map the first time a new layer
      // is added and the attributions of the map have changed
      if (!this._originalAttributions) {
        this._originalAttributions = Object.keys(attributionControl._attributions);
      }

      // Clear the attributions and re-add the original and custom attributions in
      // the order we want
      attributionControl._attributions = {};
      var newAttributions = this._originalAttributions.concat(this.map.get('attribution'));
      _.each(newAttributions, function(attribution) {
        attributionControl.addAttribution(attribution);
      });
    },

    _getAttributionControl: function() {
      if (this._attributionControl) {
        return this._attributionControl;
      }

      this._attributionControl = this.map_leaflet.attributionControl;
      if (!this._attributionControl) {
        this._attributionControl = L.control.attribution({ prefix: '' });
        this.map_leaflet.addControl(this._attributionControl);
      }

      return this._attributionControl;
    },

    getSize: function() {
      return this.map_leaflet.getSize();
    },

    panBy: function(p) {
      this.map_leaflet.panBy(new L.Point(p.x, p.y));
    },

    setCursor: function(cursor) {
      $(this.map_leaflet.getContainer()).css('cursor', cursor);
    },

    getNativeMap: function() {
      return this.map_leaflet;
    },

    invalidateSize: function() {
      // there is a race condition in leaflet. If size is invalidated
      // and at the same time the center is set the final center is displaced
      // so set pan to false so the map is not moved and then force the map
      // to be at the place it should be
      this.map_leaflet.invalidateSize({ pan: false })//, animate: false });
      this.map_leaflet.setView(this.map.get("center"), this.map.get("zoom") || 0, {
        animate: false
      });
    }

  }, {

    layerTypeMap: {
      "tiled": cdb.geo.LeafLetTiledLayerView,
      "wms": cdb.geo.LeafLetWMSLayerView,
      "cartodb": cdb.geo.LeafLetLayerCartoDBView,
      "carto": cdb.geo.LeafLetLayerCartoDBView,
      "plain": cdb.geo.LeafLetPlainLayerView,

      // Substitutes the GMaps baselayer w/ an equivalent Leaflet tiled layer, since not supporting Gmaps anymore
      "gmapsbase": cdb.geo.LeafLetGmapsTiledLayerView,

      "layergroup": cdb.geo.LeafLetCartoDBLayerGroupView,
      "namedmap": cdb.geo.LeafLetCartoDBNamedMapView,
      "torque": function(layer, map) {
        return new cdb.geo.LeafLetTorqueLayer(layer, map);
      }
    },

    createLayer: function(layer, map) {
      var layer_view = null;
      var layerClass = this.layerTypeMap[layer.get('type').toLowerCase()];

      if (layerClass) {
        try {
          layer_view = new layerClass(layer, map);
        } catch(e) {
          cdb.log.error("MAP: error creating '" +  layer.get('type') + "' layer -> " + e.message);
        }
      } else {
        cdb.log.error("MAP: " + layer.get('type') + " can't be created");
      }
      return layer_view;
    },

    addLayerToMap: function(layer_view, map, pos) {
      map.addLayer(layer_view.leafletLayer);
      if(pos !== undefined) {
        if (layer_view.setZIndex) {
          layer_view.setZIndex(pos);
        }
      }
    },

    /**
     * create the view for the geometry model
     */
    createGeometry: function(geometryModel) {
      if(geometryModel.isPoint()) {
        return new cdb.geo.leaflet.PointView(geometryModel);
      }
      return new cdb.geo.leaflet.PathView(geometryModel);
    }

  });

  // set the image path in order to be able to get leaflet icons
  // code adapted from leaflet
  L.Icon.Default.imagePath = (function () {
    var scripts = document.getElementsByTagName('script'),
        leafletRe = /\/?cartodb[\-\._]?([\w\-\._]*)\.js\??/;

    var i, len, src, matches;

    for (i = 0, len = scripts.length; i < len; i++) {
      src = scripts[i].src;
      matches = src.match(leafletRe);

      if (matches) {
        var bits = src.split('/')
        delete bits[bits.length - 1];
        return bits.join('/') + 'themes/css/images';
      }
    }
  }());

})();

},{}],28:[function(require,module,exports){

(function() {
  /**
  * base layer for all leaflet layers
  */
  var LeafLetLayerView = function(layerModel, leafletLayer, leafletMap) {
    this.leafletLayer = leafletLayer;
    this.leafletMap = leafletMap;
    this.model = layerModel;

    this.setModel(layerModel);

    this.type = layerModel.get('type') || layerModel.get('kind');
    this.type = this.type.toLowerCase();
  };

  _.extend(LeafLetLayerView.prototype, Backbone.Events);
  _.extend(LeafLetLayerView.prototype, {

    setModel: function(model) {
      if (this.model) {
        this.model.unbind('change', this._modelUpdated, this);
      }
      this.model = model;
      this.model.bind('change', this._modelUpdated, this);
    },

    /**
    * remove layer from the map and unbind events
    */
    remove: function() {
      this.leafletMap.removeLayer(this.leafletLayer);
      this.trigger('remove', this);
      this.model.unbind(null, null, this);
      this.unbind();
    },
    /*

    show: function() {
      this.leafletLayer.setOpacity(1.0);
    },

    hide: function() {
      this.leafletLayer.setOpacity(0.0);
    },
    */

    /**
     * reload the tiles
     */
    reload: function() {
      this.leafletLayer.redraw();
    }

  });


  cdb.geo.LeafLetLayerView = LeafLetLayerView;


})();

},{}],29:[function(require,module,exports){

(function() {

if(typeof(L) == "undefined")
  return;

L.CartoDBLayer = L.CartoDBGroupLayer.extend({

  options: {
    query:          "SELECT * FROM {{table_name}}",
    opacity:        0.99,
    attribution:    cdb.config.get('cartodb_attributions'),
    debug:          false,
    visible:        true,
    added:          false,
    extra_params:   {},
    layer_definition_version: '1.0.0'
  },


  initialize: function (options) {
    L.Util.setOptions(this, options);

    if (!options.table_name || !options.user_name || !options.tile_style) {
        throw ('cartodb-leaflet needs at least a CartoDB table name, user_name and tile_style');
    }

    L.CartoDBGroupLayer.prototype.initialize.call(this, {
      layer_definition: {
        version: this.options.layer_definition_version,
        layers: [{
          type: 'cartodb',
          options: this._getLayerDefinition(),
          infowindow: this.options.infowindow
        }]
      }
    });

    this.setOptions(this.options);
  },

  setQuery: function(layer, sql) {
    if(sql === undefined) {
      sql = layer;
      layer = 0;
    }
    sql = sql || 'select * from ' + this.options.table_name;
    LayerDefinition.prototype.setQuery.call(this, layer, sql);
  },

  /**
   * Returns if the layer is visible or not
   */
  isVisible: function() {
    return this.visible;
  },


  /**
   * Returns if the layer belongs to the map
   */
  isAdded: function() {
    return this.options.added;
  }

});

/**
 * leatlet cartodb layer
 */

var LeafLetLayerCartoDBView = L.CartoDBLayer.extend({
  //var LeafLetLayerCartoDBView = function(layerModel, leafletMap) {
  initialize: function(layerModel, leafletMap) {
    var self = this;

    _.bindAll(this, 'featureOut', 'featureOver', 'featureClick');

    var opts = _.clone(layerModel.attributes);

    opts.map =  leafletMap;

    var // preserve the user's callbacks
    _featureOver  = opts.featureOver,
    _featureOut   = opts.featureOut,
    _featureClick = opts.featureClick;

    opts.featureOver  = function() {
      _featureOver  && _featureOver.apply(this, arguments);
      self.featureOver  && self.featureOver.apply(this, arguments);
    };

    opts.featureOut  = function() {
      _featureOut  && _featureOut.apply(this, arguments);
      self.featureOut  && self.featureOut.apply(this, arguments);
    };

    opts.featureClick  = function() {
      _featureClick  && _featureClick.apply(this, arguments);
      self.featureClick  && self.featureClick.apply(opts, arguments);
    };

    layerModel.bind('change:visible', function() {
      self.model.get('visible') ? self.show(): self.hide();
    }, this);

    L.CartoDBLayer.prototype.initialize.call(this, opts);
    cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);

  },

  _modelUpdated: function() {
    var attrs = _.clone(this.model.attributes);
    this.leafletLayer.setOptions(attrs);
  },

  featureOver: function(e, latlon, pixelPos, data) {
    // dont pass leaflet lat/lon
    this.trigger('featureOver', e, [latlon.lat, latlon.lng], pixelPos, data, 0);
  },

  featureOut: function(e) {
    this.trigger('featureOut', e, 0);
  },

  featureClick: function(e, latlon, pixelPos, data) {
    // dont pass leaflet lat/lon
    this.trigger('featureClick', e, [latlon.lat, latlon.lng], pixelPos, data, 0);
  },

  reload: function() {
    this.model.invalidate();
    //this.redraw();
  },

  error: function(e) {
    this.trigger('error', e?e.error:'unknown error');
    this.model.trigger('tileError', e?e.error:'unknown error');
  },

  tilesOk: function(e) {
    this.model.trigger('tileOk');
  },

  includes: [
    cdb.geo.LeafLetLayerView.prototype,
    Backbone.Events
  ]

});

/*_.extend(L.CartoDBLayer.prototype, CartoDBLayerCommon.prototype);

_.extend(
  LeafLetLayerCartoDBView.prototype,
  cdb.geo.LeafLetLayerView.prototype,
  L.CartoDBLayer.prototype,
  Backbone.Events, // be sure this is here to not use the on/off from leaflet

  */
cdb.geo.LeafLetLayerCartoDBView = LeafLetLayerCartoDBView;

})();

},{}],30:[function(require,module,exports){

(function() {

if(typeof(L) == "undefined")
  return;


L.CartoDBGroupLayerBase = L.TileLayer.extend({

  interactionClass: wax.leaf.interaction,

  includes: [
    cdb.geo.LeafLetLayerView.prototype,
    //LayerDefinition.prototype,
    CartoDBLayerCommon.prototype
  ],

  options: {
    opacity:        0.99,
    attribution:    cdb.config.get('cartodb_attributions'),
    debug:          false,
    visible:        true,
    added:          false,
    tiler_domain:   "cartodb.com",
    tiler_port:     "80",
    tiler_protocol: "http",
    sql_api_domain:     "cartodb.com",
    sql_api_port:       "80",
    sql_api_protocol:   "http",
    maxZoom: 30, // default leaflet zoom level for a layers is 18, raise it 
    extra_params:   {
    },
    cdn_url:        null,
    subdomains:     null
  },


  initialize: function (options) {
    options = options || {};
    // Set options
    L.Util.setOptions(this, options);

    // Some checks
    if (!options.layer_definition && !options.sublayers) {
        throw new Error('cartodb-leaflet needs at least the layer_definition or sublayer list');
    }

    if(!options.layer_definition) {
      this.options.layer_definition = LayerDefinition.layerDefFromSubLayers(options.sublayers);
    }

    LayerDefinition.call(this, this.options.layer_definition, this.options);

    this.fire = this.trigger;

    CartoDBLayerCommon.call(this);
    L.TileLayer.prototype.initialize.call(this);
    this.interaction = [];
    this.addProfiling();
  },

  addProfiling: function() {
    this.bind('tileloadstart', function(e) {
      var s = this.tileStats || (this.tileStats = {});
      s[e.tile.src] = cartodb.core.Profiler.metric('cartodb-js.tile.png.load.time').start();
    });
    var finish = function(e) {
      var s = this.tileStats && this.tileStats[e.tile.src];
      s && s.end();
    };
    this.bind('tileload', finish);
    this.bind('tileerror', function(e) {
      cartodb.core.Profiler.metric('cartodb-js.tile.png.error').inc();
      finish(e);
    });
  },


  // overwrite getTileUrl in order to
  // support different tiles subdomains in tilejson way
  getTileUrl: function (tilePoint) {
    var EMPTY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    this._adjustTilePoint(tilePoint);

    var tiles = [EMPTY_GIF];
    if(this.tilejson) {
      tiles = this.tilejson.tiles;
    }

    var index = (tilePoint.x + tilePoint.y) % tiles.length;

    return L.Util.template(tiles[index], L.Util.extend({
      z: this._getZoomForUrl(),
      x: tilePoint.x,
      y: tilePoint.y
    }, this.options));
  },

  /**
   * Change opacity of the layer
   * @params {Integer} New opacity
   */
  setOpacity: function(opacity) {

    if (isNaN(opacity) || opacity>1 || opacity<0) {
      throw new Error(opacity + ' is not a valid value');
    }

    // Leaflet only accepts 0-0.99... Weird!
    this.options.opacity = Math.min(opacity, 0.99);

    if (this.options.visible) {
      L.TileLayer.prototype.setOpacity.call(this, this.options.opacity);
      this.fire('updated');
    }
  },


  /**
   * When Leaflet adds the layer... go!
   * @params {map}
   */
  onAdd: function(map) {
    var self = this;
    this.options.map = map;
    
    // Add cartodb logo
    if (this.options.cartodb_logo != false)
      cdb.geo.common.CartoDBLogo.addWadus({ left:8, bottom:8 }, 0, map._container);

    this.__update(function() {
      // if while the layer was processed in the server is removed
      // it should not be added to the map
      var id = L.stamp(self);
      if (!map._layers[id]) { 
        return; 
      }

      L.TileLayer.prototype.onAdd.call(self, map);
      self.fire('added');
      self.options.added = true;
    });
  },


  /**
   * When removes the layer, destroy interactivity if exist
   */
  onRemove: function(map) {
    if(this.options.added) {
      this.options.added = false;
      L.TileLayer.prototype.onRemove.call(this, map);
    }
  },

  /**
   * Update CartoDB layer
   * generates a new url for tiles and refresh leaflet layer
   * do not collide with leaflet _update
   */
  __update: function(done) {
    var self = this;
    this.fire('updated');
    this.fire('loading');
    var map = this.options.map;

    this.getTiles(function(urls, err) {
      if(urls) {
        self.tilejson = urls;
        self.setUrl(self.tilejson.tiles[0]);
        // manage interaction
        self._reloadInteraction();
        self.ok && self.ok();
        done && done();
      } else {
        self.error && self.error(err);
        done && done();
      }
    });
  },


  _checkLayer: function() {
    if (!this.options.added) {
      throw new Error('the layer is not still added to the map');
    }
  },

  /**
   * Set a new layer attribution
   * @params {String} New attribution string
   */
  setAttribution: function(attribution) {
    this._checkLayer();

    // Remove old one
    this.map.attributionControl.removeAttribution(this.options.attribution);

    // Set new attribution in the options
    this.options.attribution = attribution;

    // Change text
    this.map.attributionControl.addAttribution(this.options.attribution);

    // Change in the layer
    this.options.attribution = this.options.attribution;
    this.tilejson.attribution = this.options.attribution;

    this.fire('updated');
  },

  /**
   * Bind events for wax interaction
   * @param {Object} Layer map object
   * @param {Event} Wax event
   */
  _manageOnEvents: function(map, o) {
    var layer_point = this._findPos(map,o);

    if (!layer_point || isNaN(layer_point.x) || isNaN(layer_point.y)) {
      // If layer_point doesn't contain x and y,
      // we can't calculate event map position
      return false;
    }

    var latlng = map.layerPointToLatLng(layer_point);
    var event_type = o.e.type.toLowerCase();
    var screenPos = map.layerPointToContainerPoint(layer_point);

    switch (event_type) {
      case 'mousemove':
        if (this.options.featureOver) {
          return this.options.featureOver(o.e,latlng, screenPos, o.data, o.layer);
        }
        break;

      case 'click':
      case 'touchend':
      case 'touchmove': // for some reason android browser does not send touchend
      case 'mspointerup':
      case 'pointerup':
      case 'pointermove':
        if (this.options.featureClick) {
          this.options.featureClick(o.e,latlng, screenPos, o.data, o.layer);
        }
        break;
      default:
        break;
    }
  },


  /**
   * Bind off event for wax interaction
   */
  _manageOffEvents: function(map, o) {
    if (this.options.featureOut) {
      return this.options.featureOut && this.options.featureOut(o.e, o.layer);
    }
  },

  /**
   * Get the Leaflet Point of the event
   * @params {Object} Map object
   * @params {Object} Wax event object
   */
  _findPos: function (map, o) {
    var curleft = 0;
    var curtop = 0;
    var obj = map.getContainer();

    var x, y;
    if (o.e.changedTouches && o.e.changedTouches.length > 0) {
      x = o.e.changedTouches[0].clientX + window.scrollX;
      y = o.e.changedTouches[0].clientY + window.scrollY;
    } else {
      x = o.e.clientX;
      y = o.e.clientY;
    }

    // If the map is fixed at the top of the window, we can't use offsetParent
    // cause there might be some scrolling that we need to take into account.
    if (obj.offsetParent && obj.offsetTop > 0) {
      do {
        curleft += obj.offsetLeft;
        curtop += obj.offsetTop;
      } while (obj = obj.offsetParent);
      var point = this._newPoint(
        x - curleft, y - curtop);
    } else {
      var rect = obj.getBoundingClientRect();
      var scrollX = (window.scrollX || window.pageXOffset);
      var scrollY = (window.scrollY || window.pageYOffset);
      var point = this._newPoint(
        (o.e.clientX? o.e.clientX: x) - rect.left - obj.clientLeft - scrollX,
        (o.e.clientY? o.e.clientY: y) - rect.top - obj.clientTop - scrollY);
    }
    return map.containerPointToLayerPoint(point);
  },

  /**
   * Creates an instance of a Leaflet Point
   */
  _newPoint: function(x, y) {
    return new L.Point(x, y);
  }
});

L.CartoDBGroupLayer = L.CartoDBGroupLayerBase.extend({
  includes: [
    LayerDefinition.prototype,
  ],

  _modelUpdated: function() {
    this.setLayerDefinition(this.model.get('layer_definition'));
  }
});

function layerView(base) {
  var layerViewClass = base.extend({

    includes: [
      cdb.geo.LeafLetLayerView.prototype,
      Backbone.Events
    ],

    initialize: function(layerModel, leafletMap) {
      var self = this;
      var hovers = [];

      var opts = _.clone(layerModel.attributes);

      opts.map =  leafletMap;

      var // preserve the user's callbacks
      _featureOver  = opts.featureOver,
      _featureOut   = opts.featureOut,
      _featureClick = opts.featureClick;

      var previousEvent;
      var eventTimeout = -1;

      opts.featureOver  = function(e, latlon, pxPos, data, layer) {
        if (!hovers[layer]) {
          self.trigger('layerenter', e, latlon, pxPos, data, layer);
        }
        hovers[layer] = 1;
        _featureOver  && _featureOver.apply(this, arguments);
        self.featureOver  && self.featureOver.apply(self, arguments);
        // if the event is the same than before just cancel the event
        // firing because there is a layer on top of it
        if (e.timeStamp === previousEvent) {
          clearTimeout(eventTimeout);
        }
        eventTimeout = setTimeout(function() {
          self.trigger('mouseover', e, latlon, pxPos, data, layer);
          self.trigger('layermouseover', e, latlon, pxPos, data, layer);
        }, 0);
        previousEvent = e.timeStamp;

      };

      opts.featureOut  = function(m, layer) {
        if (hovers[layer]) {
          self.trigger('layermouseout', layer);
        }
        hovers[layer] = 0;
        if(!_.any(hovers)) {
          self.trigger('mouseout');
        }
        _featureOut  && _featureOut.apply(this, arguments);
        self.featureOut  && self.featureOut.apply(self, arguments);
      };

      opts.featureClick  = _.debounce(function() {
        _featureClick  && _featureClick.apply(self, arguments);
        self.featureClick  && self.featureClick.apply(self, arguments);
      }, 10);


      base.prototype.initialize.call(this, opts);
      cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);

    },

    featureOver: function(e, latlon, pixelPos, data, layer) {
      // dont pass leaflet lat/lon
      this.trigger('featureOver', e, [latlon.lat, latlon.lng], pixelPos, data, layer);
    },

    featureOut: function(e, layer) {
      this.trigger('featureOut', e, layer);
    },

    featureClick: function(e, latlon, pixelPos, data, layer) {
      // dont pass leaflet lat/lon
      this.trigger('featureClick', e, [latlon.lat, latlon.lng], pixelPos, data, layer);
    },

    error: function(e) {
      this.trigger('error', e ? (e.errors || e) : 'unknown error');
      this.model.trigger('error', e?e.errors:'unknown error');
    },

    ok: function(e) {
      this.model.trigger('tileOk');
    },

    onLayerDefinitionUpdated: function() {
      this.__update();
    }

  });

  return layerViewClass;
}

L.NamedMap = L.CartoDBGroupLayerBase.extend({
  includes: [
    cdb.geo.LeafLetLayerView.prototype,
    NamedMap.prototype,
    CartoDBLayerCommon.prototype
  ],

  initialize: function (options) {
    options = options || {};
    // Set options
    L.Util.setOptions(this, options);

    // Some checks
    if (!options.named_map && !options.sublayers) {
        throw new Error('cartodb-leaflet needs at least the named_map');
    }

    NamedMap.call(this, this.options.named_map, this.options);

    this.fire = this.trigger;

    CartoDBLayerCommon.call(this);
    L.TileLayer.prototype.initialize.call(this);
    this.interaction = [];
    this.addProfiling();
  },

  _modelUpdated: function() {
    this.setLayerDefinition(this.model.get('named_map'));
  }
});

cdb.geo.LeafLetCartoDBLayerGroupView = layerView(L.CartoDBGroupLayer);
cdb.geo.LeafLetCartoDBNamedMapView = layerView(L.NamedMap);

})();

},{}],31:[function(require,module,exports){

(function() {

  if(typeof(L) == "undefined")
    return;

  var stamenSubstitute = function stamenSubstitute(type) {
    return {
      url: 'http://{s}.basemaps.cartocdn.com/'+ type +'_all/{z}/{x}/{y}.png',
      subdomains: 'abcd',
      minZoom: 0,
      maxZoom: 18,
      attribution: 'Map designs by <a href="http://stamen.com/">Stamen</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, Provided by <a href="http://cartodb.com">CartoDB</a>'
    };
  };
  
  var nokiaSubstitute = function nokiaSubstitute(type) {
    return {
      url: 'https://{s}.maps.nlp.nokia.com/maptile/2.1/maptile/newest/'+ type +'.day/{z}/{x}/{y}/256/png8?lg=eng&token=A7tBPacePg9Mj_zghvKt9Q&app_id=KuYppsdXZznpffJsKT24',
      subdomains: '1234',
      minZoom: 0,
      maxZoom: 21,
      attribution: '©2012 Nokia <a href="http://here.net/services/terms" target="_blank">Terms of use</a>'
    };
  };

  var substitutes = {
    roadmap: nokiaSubstitute('normal'),
    gray_roadmap: stamenSubstitute('light'),
    dark_roadmap: stamenSubstitute('dark'),
    hybrid: nokiaSubstitute('hybrid'),
    terrain: nokiaSubstitute('terrain'),
    satellite: nokiaSubstitute('satellite')
  };

  var LeafLetGmapsTiledLayerView = L.TileLayer.extend({
    initialize: function(layerModel, leafletMap) {
      var substitute = substitutes[layerModel.get('base_type')];
      L.TileLayer.prototype.initialize.call(this, substitute.url, {
        tms:          false,
        attribution:  substitute.attribution,
        minZoom:      substitute.minZoom,
        maxZoom:      substitute.maxZoom,
        subdomains:   substitute.subdomains,
        errorTileUrl: '',
        opacity:      1
      });
      cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);
    }

  });

  _.extend(LeafLetGmapsTiledLayerView.prototype, cdb.geo.LeafLetLayerView.prototype, {

    _modelUpdated: function() {
      // do nothing, this map type does not support updating
    }

  });

  cdb.geo.LeafLetGmapsTiledLayerView = LeafLetGmapsTiledLayerView;

})();

},{}],32:[function(require,module,exports){

(function() {

if(typeof(L) == "undefined")
  return;

/**
 * this is a dummy layer class that modifies the leaflet DOM element background
 * instead of creating a layer with div
 */
var LeafLetPlainLayerView = L.Class.extend({
  includes: L.Mixin.Events,

  initialize: function(layerModel, leafletMap) {
    cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);
  },

  onAdd: function() {
    this.redraw();
  },

  onRemove: function() {
    var div = this.leafletMap.getContainer()
    div.style.background = 'none';
  },

  _modelUpdated: function() {
    this.redraw();
  },

  redraw: function() {
    var div = this.leafletMap.getContainer()
    div.style.backgroundColor = this.model.get('color') || '#FFF';

    if (this.model.get('image')) {
      var st = 'transparent url(' + this.model.get('image') + ') repeat center center';
      div.style.background = st
    }
  },

  // this method
  setZIndex: function() {
  }

});

_.extend(LeafLetPlainLayerView.prototype, cdb.geo.LeafLetLayerView.prototype);

cdb.geo.LeafLetPlainLayerView = LeafLetPlainLayerView;

})();

},{}],33:[function(require,module,exports){

(function() {

if(typeof(L) == "undefined") 
  return;

var LeafLetTiledLayerView = L.TileLayer.extend({
  initialize: function(layerModel, leafletMap) {
    L.TileLayer.prototype.initialize.call(this, layerModel.get('urlTemplate'), {
      tms:          layerModel.get('tms'),
      attribution:  layerModel.get('attribution'),
      minZoom:      layerModel.get('minZoom'),
      maxZoom:      layerModel.get('maxZoom'),
      subdomains:   layerModel.get('subdomains') || 'abc',
      errorTileUrl: layerModel.get('errorTileUrl'),
      opacity:      layerModel.get('opacity')
    });
    cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);
  }

});

_.extend(LeafLetTiledLayerView.prototype, cdb.geo.LeafLetLayerView.prototype, {

  _modelUpdated: function() {
    _.defaults(this.leafletLayer.options, _.clone(this.model.attributes));
    this.leafletLayer.options.subdomains = this.model.get('subdomains') || 'abc';
    this.leafletLayer.options.attribution = this.model.get('attribution');
    this.leafletLayer.options.maxZoom = this.model.get('maxZoom');
    this.leafletLayer.options.minZoom = this.model.get('minZoom');
    // set url and reload
    this.leafletLayer.setUrl(this.model.get('urlTemplate'));
  }

});

cdb.geo.LeafLetTiledLayerView = LeafLetTiledLayerView;

})();

},{}],34:[function(require,module,exports){

(function() {

if(typeof(L) == "undefined")
  return;

var LeafLetWMSLayerView = L.TileLayer.WMS.extend({
  initialize: function(layerModel, leafletMap) {

    L.TileLayer.WMS.prototype.initialize.call(this, layerModel.get('urlTemplate'), {
      attribution:  layerModel.get('attribution'),
      layers:       layerModel.get('layers'),
      format:       layerModel.get('format'),
      transparent:  layerModel.get('transparent'),
      minZoom:      layerModel.get('minZomm'),
      maxZoom:      layerModel.get('maxZoom'),
      subdomains:   layerModel.get('subdomains') || 'abc',
      errorTileUrl: layerModel.get('errorTileUrl'),
      opacity:      layerModel.get('opacity')
    });

    cdb.geo.LeafLetLayerView.call(this, layerModel, this, leafletMap);
  }

});

_.extend(LeafLetWMSLayerView.prototype, cdb.geo.LeafLetLayerView.prototype, {

  _modelUpdated: function() {
    _.defaults(this.leafletLayer.options, _.clone(this.model.attributes));
    this.leafletLayer.setUrl(this.model.get('urlTemplate'));
  }

});

cdb.geo.LeafLetWMSLayerView = LeafLetWMSLayerView;

})();

},{}],35:[function(require,module,exports){
/**
* Classes to manage maps
*/

/**
* Map layer, could be tiled or whatever
*/
cdb.geo.MapLayer = cdb.core.Model.extend({

  defaults: {
    visible: true,
    type: 'Tiled'
  },

  /***
  * Compare the layer with the received one
  * @method isEqual
  * @param layer {Layer}
  */
  isEqual: function(layer) {
    var me          = this.toJSON()
      , other       = layer.toJSON()
      // Select params generated when layer is added to the map
      , map_params  = ['id', 'order'];

    // Delete from the layers copy
    _.each(map_params, function(param){
      delete me[param];
      delete other[param];
      if (me.options)     delete me.options[param];
      if (other.options)  delete other.options[param];
    });

    var myType  = me.type? me.type : me.options.type
      , itsType = other.type? other.type : other.options.type;

    if(myType && (myType === itsType)) {

      if(myType === 'Tiled') {
        var myTemplate  = me.urlTemplate? me.urlTemplate : me.options.urlTemplate;
        var itsTemplate = other.urlTemplate? other.urlTemplate : other.options.urlTemplate;
        var myName = me.name? me.name : me.options.name;
        var itsName = other.name? other.name : other.options.name;

        return myTemplate === itsTemplate && myName === itsName;
      } else if(myType === 'WMS') {
        var myTemplate  = me.urlTemplate? me.urlTemplate : me.options.urlTemplate;
        var itsTemplate = other.urlTemplate? other.urlTemplate : other.options.urlTemplate;
        var myLayer  = me.layers? me.layers : me.options.layers;
        var itsLayer = other.layers? other.layers : other.options.layers;
        return myTemplate === itsTemplate && myLayer === itsLayer;
      }
      else if (myType === 'torque') {
        return cdb.geo.TorqueLayer.prototype.isEqual.call(this, layer);
      }
      else if (myType === 'named_map') {
        return cdb.geo.CartoDBNamedMapLayer.prototype.isEqual.call(this, layer);
      } else { // same type but not tiled
        var myBaseType = me.base_type? me.base_type : me.options.base_type;
        var itsBaseType = other.base_type? other.base_type : other.options.base_type;
        if(myBaseType) {
          if(_.isEqual(me,other)) {
            return true;
          } else {
            return false;
          }
        } else { // not gmaps
          return true;
        }
      }
    }
    return false; // different type
  }
});

// Good old fashioned tile layer
cdb.geo.TileLayer = cdb.geo.MapLayer.extend({
  getTileLayer: function() {
  }
});

cdb.geo.GMapsBaseLayer = cdb.geo.MapLayer.extend({
  OPTIONS: ['roadmap', 'satellite', 'terrain', 'custom'],
  defaults: {
    type: 'GMapsBase',
    base_type: 'gray_roadmap',
    style: null
  }
});

/**
 * WMS layer support
 */
cdb.geo.WMSLayer = cdb.geo.MapLayer.extend({
  defaults: {
    service: 'WMS',
    request: 'GetMap',
    version: '1.1.1',
    layers: '',
    styles: '',
    format: 'image/jpeg',
    transparent: false
  }
});

/**
 * this layer allows to put a plain color or image as layer (instead of tiles)
 */
cdb.geo.PlainLayer = cdb.geo.MapLayer.extend({
  defaults: {
    type: 'Plain',
    base_type: "plain",
    className: "plain",
    color: '#FFFFFF',
    image: ''
  }
});

cdb.geo.TorqueLayer = cdb.geo.MapLayer.extend({
  defaults: {
    type: 'torque',
    visible: true
  },

  isEqual: function(other) {
    var properties = ['query', 'query_wrapper', 'cartocss'];
    var self = this;
    return this.get('type') === other.get('type') && _.every(properties, function(p) {
      return other.get(p) === self.get(p);
    });
  }
});

// CartoDB layer
cdb.geo.CartoDBLayer = cdb.geo.MapLayer.extend({

  defaults: {
    attribution: cdb.config.get('cartodb_attributions'),
    type: 'CartoDB',
    active: true,
    query: null,
    opacity: 0.99,
    interactivity: null,
    interaction: true,
    debug: false,
    tiler_domain: "cartodb.com",
    tiler_port: "80",
    tiler_protocol: "http",
    sql_api_domain: "cartodb.com",
    sql_api_port: "80",
    sql_api_protocol: "http",
    extra_params: {},
    cdn_url: null,
    maxZoom: 28
  },

  activate: function() {
    this.set({active: true, opacity: 0.99, visible: true})
  },

  deactivate: function() {
    this.set({active: false, opacity: 0, visible: false})
  },

  /**
   * refresh the layer
   */
  invalidate: function() {
    var e = this.get('extra_params') || e;
    e.cache_buster = new Date().getTime();
    this.set('extra_params', e);
    this.trigger('change', this);
  },

  toggle: function() {
    if(this.get('active')) {
      this.deactivate();
    } else {
      this.activate();
    }
  },

  /*isEqual: function() {
    return false;
  }*/
});

cdb.geo.CartoDBGroupLayer = cdb.geo.MapLayer.extend({

  defaults: {
    visible: true,
    type: 'layergroup'
  },

  initialize: function() {
    this.sublayers = new cdb.geo.Layers();
  },

  isEqual: function() {
    return false;
  },

  contains: function(layer) {
    return layer.get('type') === 'cartodb';
  }
});

cdb.geo.CartoDBNamedMapLayer = cdb.geo.MapLayer.extend({
  defaults: {
    visible: true,
    type: 'namedmap'
  },

  isEqual: function(other) {
    return _.isEqual(this.get('options').named_map, other.get('options').named_map);
  }

});

var TILED_LAYER_TYPE = 'Tiled';
var CARTODB_LAYER_TYPE = 'CartoDB';
var TORQUE_LAYER_TYPE = 'torque';

cdb.geo.Layers = Backbone.Collection.extend({

  model: cdb.geo.MapLayer,

  initialize: function() {
    this.comparator = function(m) {
      return parseInt(m.get('order'), 10);
    };
    this.bind('add', this._assignIndexes);
    this.bind('remove', this._assignIndexes);
  },

  /**
   * each time a layer is added or removed
   * the index should be recalculated
   */
  _assignIndexes: function(model, col, options) {
    if (this.size() > 0) {

      // Assign an order of 0 to the first layer
      this.at(0).set({ order: 0 });

      if (this.size() > 1) {
        var layersByType = {};
        for (var i = 1; i < this.size(); ++i) {
          var layer = this.at(i);
          var layerType = layer.get('type');
          layersByType[layerType] = layersByType[layerType] || [];
          layersByType[layerType].push(layer);
        }

        var lastOrder = 0;
        var sortedTypes = [CARTODB_LAYER_TYPE, TORQUE_LAYER_TYPE, TILED_LAYER_TYPE];
        for (var i = 0; i < sortedTypes.length; ++i) {
          var type = sortedTypes[i];
          var layers = layersByType[type] || [];
          for (var j = 0; j < layers.length; ++j) {
            var layer = layers[j];
            layer.set({
              order: ++lastOrder
            });
          }
        }
      }
    }
  }
});

/**
* map model itself
*/
cdb.geo.Map = cdb.core.Model.extend({

  defaults: {
    attribution: [cdb.config.get('cartodb_attributions')],
    center: [0, 0],
    zoom: 3,
    minZoom: 0,
    maxZoom: 40,
    scrollwheel: true,
    keyboard: true,
    provider: 'leaflet'
  },

  initialize: function() {
    this.layers = new cdb.geo.Layers();

    this.layers.bind('reset', function() {
      if(this.layers.size() >= 1) {
        this._adjustZoomtoLayer(this.layers.models[0]);
      }
    }, this);

    this.layers.bind('reset', this._updateAttributions, this);
    this.layers.bind('add', this._updateAttributions, this);
    this.layers.bind('remove', this._updateAttributions, this);
    this.layers.bind('change:attribution', this._updateAttributions, this);

    this.geometries = new cdb.geo.Geometries();
  },

  _updateAttributions: function() {
    var defaultCartoDBAttribution = this.defaults.attribution[0];
    var attributions = _.chain(this.layers.models)
      .map(function(layer) { return layer.get('attribution'); })
      .reject(function(attribution) { return attribution == defaultCartoDBAttribution})
      .compact()
      .uniq()
      .value();

    attributions.push(defaultCartoDBAttribution);

    this.set('attribution', attributions);
  },

  setView: function(latlng, zoom) {
    this.set({
      center: latlng,
      zoom: zoom
    }, {
      silent: true
    });
    this.trigger("set_view");
  },

  setZoom: function(z) {
    this.set({
      zoom: z
    });
  },

  enableKeyboard: function() {
    this.set({
      keyboard: true
    });
  },

  disableKeyboard: function() {
    this.set({
      keyboard: false
    });
  },

  enableScrollWheel: function() {
    this.set({
      scrollwheel: true
    });
  },

  disableScrollWheel: function() {
    this.set({
      scrollwheel: false
    });
  },

  getZoom: function() {
    return this.get('zoom');
  },

  setCenter: function(latlng) {
    this.set({
      center: latlng
    });
  },

  /**
  * Change multiple options at the same time
  * @params {Object} New options object
  */
  setOptions: function(options) {
    if (typeof options != "object" || options.length) {
      if (this.options.debug) {
        throw (options + ' options has to be an object');
      } else {
        return;
      }
    }

    // Set options
    _.defaults(this.options, options);
  },

  /**
  * return getViewbounds if it is set
  */
  getViewBounds: function() {
    if(this.has('view_bounds_sw') && this.has('view_bounds_ne')) {
      return [
        this.get('view_bounds_sw'),
        this.get('view_bounds_ne')
      ];
    }
    return null;
  },

  getLayerAt: function(i) {
    return this.layers.at(i);
  },

  getLayerByCid: function(cid) {
    return this.layers.getByCid(cid);
  },

  _adjustZoomtoLayer: function(layer) {

    var maxZoom = parseInt(layer.get('maxZoom'), 10);
    var minZoom = parseInt(layer.get('minZoom'), 10);

    if (_.isNumber(maxZoom) && !_.isNaN(maxZoom)) {
      if ( this.get("zoom") > maxZoom ) this.set({ zoom: maxZoom, maxZoom: maxZoom });
      else this.set("maxZoom", maxZoom);
    }

    if (_.isNumber(minZoom) && !_.isNaN(minZoom)) {
      if ( this.get("zoom") < minZoom ) this.set({ minZoom: minZoom, zoom: minZoom });
      else this.set("minZoom", minZoom);
    }

  },

  addLayer: function(layer, opts) {
    if(this.layers.size() == 0) {
      this._adjustZoomtoLayer(layer);
    }
    this.layers.add(layer, opts);
    this.trigger('layerAdded');
    if(this.layers.length === 1) {
      this.trigger('firstLayerAdded');
    }
    return layer.cid;
  },

  removeLayer: function(layer) {
    this.layers.remove(layer);
  },

  removeLayerByCid: function(cid) {
    var layer = this.layers.getByCid(cid);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer with cid = " + cid + ".");
  },

  removeLayerAt: function(i) {
    var layer = this.layers.at(i);

    if (layer) this.removeLayer(layer);
    else cdb.log.error("There's no layer in that position.");
  },

  clearLayers: function() {
    while (this.layers.length > 0) {
      this.removeLayer(this.layers.at(0));
    }
  },

  // by default the base layer is the layer at index 0
  getBaseLayer: function() {
    return this.layers.at(0);
  },

  /**
  * Checks if the base layer is already in the map as base map
  */
  isBaseLayerAdded: function(layer) {
    var baselayer = this.getBaseLayer()
    return baselayer && layer.isEqual(baselayer);
  },

  /**
  * gets the url of the template of the tile layer
  * @method getLayerTemplate
  */
  getLayerTemplate: function() {
    var baseLayer = this.getBaseLayer();
    if(baseLayer && baseLayer.get('options'))  {
      return baseLayer.get('options').urlTemplate;
    }
  },

  addGeometry: function(geom) {
    this.geometries.add(geom);
  },

  removeGeometry: function(geom) {
    this.geometries.remove(geom);
  },

  setBounds: function(b) {
    this.attributes.view_bounds_sw = [
      b[0][0],
      b[0][1]
    ];
    this.attributes.view_bounds_ne = [
      b[1][0],
      b[1][1]
    ];

    // change both at the same time
    this.trigger('change:view_bounds_ne', this);
  },

  // set center and zoom according to fit bounds
  fitBounds: function(bounds, mapSize) {
    var z = this.getBoundsZoom(bounds, mapSize);
    if(z === null) {
      return;
    }

    // project -> calculate center -> unproject
    var swPoint = cdb.geo.Map.latlngToMercator(bounds[0], z);
    var nePoint = cdb.geo.Map.latlngToMercator(bounds[1], z);

    var center = cdb.geo.Map.mercatorToLatLng({
      x: (swPoint[0] + nePoint[0])*0.5,
      y: (swPoint[1] + nePoint[1])*0.5
    }, z);
    this.set({
      center: center,
      zoom: z
    })
  },

  // adapted from leaflat src
  // @return {Number, null} Calculated zoom from given bounds or the maxZoom if no appropriate zoom level could be found
  //   or null if given mapSize has no size.
  getBoundsZoom: function(boundsSWNE, mapSize) {
    // sometimes the map reports size = 0 so return null
    if(mapSize.x === 0 || mapSize.y === 0) return null;
    var size = [mapSize.x, mapSize.y],
    zoom = this.get('minZoom') || 0,
    maxZoom = this.get('maxZoom') || 24,
    ne = boundsSWNE[1],
    sw = boundsSWNE[0],
    boundsSize = [],
    nePoint,
    swPoint,
    zoomNotFound = true;

    do {
      zoom++;
      nePoint = cdb.geo.Map.latlngToMercator(ne, zoom);
      swPoint = cdb.geo.Map.latlngToMercator(sw, zoom);
      boundsSize[0] = Math.abs(nePoint[0] - swPoint[0]);
      boundsSize[1] = Math.abs(swPoint[1] - nePoint[1]);
      zoomNotFound = boundsSize[0] <= size[0] || boundsSize[1] <= size[1];
    } while (zoomNotFound && zoom <= maxZoom);

    if (zoomNotFound) {
      return maxZoom;
    }

    return zoom - 1;
  }

}, {
  latlngToMercator: function(latlng, zoom) {
    var ll = new L.LatLng(latlng[0], latlng[1]);
    var pp = L.CRS.EPSG3857.latLngToPoint(ll, zoom);
    return [pp.x, pp.y];
  },

  mercatorToLatLng: function(point, zoom) {
    var ll = L.CRS.EPSG3857.pointToLatLng(point, zoom);
    return [ll.lat, ll.lng]
  }
});


/**
* Base view for all impl
*/
cdb.geo.MapView = cdb.core.View.extend({

  initialize: function() {

    if (this.options.map === undefined) {
      throw "you should specify a map model";
    }

    this.map = this.options.map;
    this.add_related_model(this.map);
    this.add_related_model(this.map.layers);

    this.autoSaveBounds = false;

    // this var stores views information for each model
    this.layers = {};
    this.geometries = {};

    this.bind('clean', this._removeLayers, this);
  },

  render: function() {
    return this;
  },

  /**
  * add a infowindow to the map
  */
  addInfowindow: function(infoWindowView) {
    this.addOverlay(infoWindowView);
  },

  addOverlay: function(overlay) {
    if (overlay) {
      this.$el.append(overlay.render().el);
      this.addView(overlay);
    }
  },

  /**
  * search in the subviews and return the infowindows
  */
  getInfoWindows: function() {
    var result = [];
    for (var s in this._subviews) {
      if(this._subviews[s] instanceof cdb.geo.ui.Infowindow) {
        result.push(this._subviews[s]);
      }
    }
    return result;
  },

  showBounds: function(bounds) {
    throw "to be implemented";
  },

  /*_removeLayers: function() {
    for(var layer in this.layers) {
      this.layers[layer].remove();
    }
    this.layers = {}
  },*/

  /**
  * set model property but unbind changes first in order to not create an infinite loop
  */
  _setModelProperty: function(prop) {
    this._unbindModel();
    this.map.set(prop);
    if(prop.center !== undefined || prop.zoom !== undefined) {
      var b = this.getBounds();
      this.map.set({
        view_bounds_sw: b[0],
        view_bounds_ne: b[1]
      });
      if(this.autoSaveBounds) {
        this._saveLocation();
      }
    }
    this._bindModel();
  },

  /** bind model properties */
  _bindModel: function() {
    this._unbindModel();
    this.map.bind('change:view_bounds_sw',  this._changeBounds, this);
    this.map.bind('change:view_bounds_ne',  this._changeBounds, this);
    this.map.bind('change:zoom',            this._setZoom, this);
    this.map.bind('change:scrollwheel',     this._setScrollWheel, this);
    this.map.bind('change:keyboard',        this._setKeyboard, this);
    this.map.bind('change:center',          this._setCenter, this);
    this.map.bind('change:attribution',     this.setAttribution, this);
  },

  /** unbind model properties */
  _unbindModel: function() {
    this.map.unbind('change:view_bounds_sw',  null, this);
    this.map.unbind('change:view_bounds_ne',  null, this);
    this.map.unbind('change:zoom',            null, this);
    this.map.unbind('change:scrollwheel',     null, this);
    this.map.unbind('change:keyboard',        null, this);
    this.map.unbind('change:center',          null, this);
    this.map.unbind('change:attribution',     null, this);
  },

  _changeBounds: function() {
    var bounds = this.map.getViewBounds();
    if(bounds) {
      this.showBounds(bounds);
    }
  },

  showBounds: function(bounds) {
    this.map.fitBounds(bounds, this.getSize())
  },

  _addLayers: function() {
    var self = this;
    this._removeLayers();
    this.map.layers.each(function(lyr) {
      self._addLayer(lyr);
    });
  },

  _removeLayers: function(layer) {
    for(var i in this.layers) {
      var layer_view = this.layers[i];
      layer_view.remove();
      delete this.layers[i];
    }
  },

  _removeLayer: function(layer) {
    var layer_view = this.layers[layer.cid];
    if(layer_view) {
      layer_view.remove();
      delete this.layers[layer.cid];
    }
  },

  _swicthLayerView: function(layer, attr, opts) {
    this._removeLayer(layer);
    this._addLayer(layer, this.map.layers, opts);
  },


  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    delete this.layers[layer.cid];
  },

  getLayerByCid: function(cid) {
    var l = this.layers[cid];
    if(!l) {
      cdb.log.debug("layer with cid " + cid + " can't be get");
    }
    return l;
  },

  _setZoom: function(model, z) {
    throw "to be implemented";
  },

  _setCenter: function(model, center) {
    throw "to be implemented";
  },

  _addLayer: function(layer, layers, opts) {
    throw "to be implemented";
  },

  _addGeomToMap: function(geom) {
    throw "to be implemented";
  },

  _removeGeomFromMap: function(geo) {
    throw "to be implemented";
  },

  setAutoSaveBounds: function() {
    var self = this;
    this.autoSaveBounds = true;
  },

  _saveLocation: _.debounce(function() {
    this.map.save(null, { silent: true });
  }, 1000),

  _addGeometry: function(geom) {
    var view = this._addGeomToMap(geom);
    this.geometries[geom.cid] = view;
  },

  _removeGeometry: function(geo) {
    var geo_view = this.geometries[geo.cid];
    this._removeGeomFromMap(geo_view);
    delete this.geometries[geo.cid];
  }


}, {
  _getClass: function(provider) {
    var mapViewClass = cdb.geo.LeafletMapView;
    if(provider === 'googlemaps') {
      if(typeof(google) != "undefined" && typeof(google.maps) != "undefined") {
        mapViewClass = cdb.geo.GoogleMapsMapView;
      } else {
        cdb.log.error("you must include google maps library _before_ include cdb");
      }
    }
    return mapViewClass;
  },

  create: function(el, mapModel) {
    var _mapViewClass = cdb.geo.MapView._getClass(mapModel.get('provider'));
    return new _mapViewClass({
      el: el,
      map: mapModel
    });
  }
});

},{}],36:[function(require,module,exports){
function SubLayerFactory() {};

SubLayerFactory.createSublayer = function(type, layer, position) {
  type = type && type.toLowerCase();
  if (!type || type === 'mapnik' || type === 'cartodb') {
    return new CartoDBSubLayer(layer, position);
  } else if (type === 'http') {
    return new HttpSubLayer(layer, position);
  } else {
    throw 'Sublayer type not supported';
  }
};

function SubLayerBase(_parent, position) {
  this._parent = _parent;
  this._position = position;
  this._added = true;
}

SubLayerBase.prototype = {

  toJSON: function() {
    throw 'toJSON must be implemented';
  },

  isValid: function() {
    throw 'isValid must be implemented';
  },

  remove: function() {
    this._check();
    this._parent.removeLayer(this._position);
    this._added = false;
    this.trigger('remove', this);
    this._onRemove();
  },

  _onRemove: function() {},

  toggle: function() {
    this.get('hidden') ? this.show() : this.hide();
    return !this.get('hidden');
  },

  show: function() {
    if(this.get('hidden')) {
      this.set({
        hidden: false
      });
    }
  },

  hide: function() {
    if(!this.get('hidden')) {
      this.set({
        hidden: true
      });
    }
  },

  set: function(new_attrs) {
    this._check();
    var def = this._parent.getLayer(this._position);
    var attrs = def.options;
    for(var i in new_attrs) {
      attrs[i] = new_attrs[i];
    }
    this._parent.setLayer(this._position, def);
    if (new_attrs.hidden !== undefined) {
      this.trigger('change:visibility', this, new_attrs.hidden);
    }
    return this;
  },

  unset: function(attr) {
    var def = this._parent.getLayer(this._position);
    delete def.options[attr];
    this._parent.setLayer(this._position, def);
  },

  get: function(attr) {
    this._check();
    var attrs = this._parent.getLayer(this._position);
    return attrs.options[attr];
  },

  isVisible: function(){
    return ! this.get('hidden');
  },

  _check: function() {
    if(!this._added) throw "sublayer was removed";
  },

  _unbindInteraction: function() {
    if(!this._parent.off) return;
    this._parent.off(null, null, this);
  },

  _bindInteraction: function() {
    if(!this._parent.on) return;
    var self = this;
    // binds a signal to a layer event and trigger on this sublayer
    // in case the position matches
    var _bindSignal = function(signal, signalAlias) {
      signalAlias = signalAlias || signal;
      self._parent.on(signal, function() {
        var args = Array.prototype.slice.call(arguments);
        if (parseInt(args[args.length - 1], 10) ==  self._position) {
          self.trigger.apply(self, [signalAlias].concat(args));
        }
      }, self);
    };
    _bindSignal('featureOver');
    _bindSignal('featureOut');
    _bindSignal('featureClick');
    _bindSignal('layermouseover', 'mouseover');
    _bindSignal('layermouseout', 'mouseout');
  },

  _setPosition: function(p) {
    this._position = p;
  }
};

// give events capabilitues
_.extend(SubLayerBase.prototype, Backbone.Events);


// CartoDB / Mapnik sublayers
function CartoDBSubLayer(layer, position) {
  SubLayerBase.call(this, layer, position);
  this._bindInteraction();

  var layer = this._parent.getLayer(this._position);
  // TODO: Test this
  if (Backbone.Model && layer) {
    this.infowindow = new Backbone.Model(layer.infowindow);
    this.infowindow.bind('change', function() {
      layer.infowindow = this.infowindow.toJSON();
      this._parent.setLayer(this._position, layer);
    }, this);
  }
};

CartoDBSubLayer.prototype = _.extend({}, SubLayerBase.prototype, {

  toJSON: function() {
    var json = {
      type: 'cartodb',
      options: {
        sql: this.getSQL(),
        cartocss: this.getCartoCSS(),
        cartocss_version: this.get('cartocss_version') || '2.1.0'
      }
    };

    var interactivity = this.getInteractivity();
    if (interactivity && interactivity.length > 0) {
      json.options.interactivity = interactivity;
      var attributes = this.getAttributes();
      if (attributes.length > 0) {
        json.options.attributes = {
          id: 'cartodb_id',
          columns: attributes
        }
      }
    }

    if (this.get('raster')) {
      json.options.raster = true;
      json.options.geom_column = "the_raster_webmercator";
      json.options.geom_type = "raster";
      json.options.raster_band = this.get('raster_band') || 0;
      // raster needs 2.3.0 to work
      json.options.cartocss_version = this.get('cartocss_version') || '2.3.0';
    }
    return json;
  },

  isValid: function() {
    return this.get('sql') && this.get('cartocss');
  },

  _onRemove: function() {
    this._unbindInteraction();
  },

  setSQL: function(sql) {
    return this.set({
      sql: sql
    });
  },

  setCartoCSS: function(cartocss) {
    return this.set({
      cartocss: cartocss
    });
  },

  setInteractivity: function(fields) {
    return this.set({
      interactivity: fields
    });
  },

  setInteraction: function(active) {
    this._parent.setInteraction(this._position, active);
  },

  getSQL: function() {
    return this.get('sql');
  },

  getCartoCSS: function() {
    return this.get('cartocss');
  },

  getInteractivity: function() {
    var interactivity = this.get('interactivity');
    if (interactivity) {
      if (typeof(interactivity) === 'string') {
        interactivity = interactivity.split(',');
      }
      return this._trimArrayItems(interactivity);
    }
  },

  getAttributes: function() {
    var columns = [];
    if (this.get('attributes')) {
      columns = this.get('attributes');
    } else {
      columns = _.map(this.infowindow.get('fields'), function(field){
        return field.name;
      });
    }
    return this._trimArrayItems(columns);
  },

  _trimArrayItems: function(array) {
    return _.map(array, function(item) {
      return item.trim();
    })
  }
});

// Http sublayer

function HttpSubLayer(layer, position) {
  SubLayerBase.call(this, layer, position);
};

HttpSubLayer.prototype = _.extend({}, SubLayerBase.prototype, {

  toJSON: function() {
    var json = {
      type: 'http',
      options: {
        urlTemplate: this.getURLTemplate()
      }
    };

    var subdomains = this.get('subdomains');
    if (subdomains) {
      json.options.subdomains = subdomains;
    }

    var tms = this.get('tms');
    if (tms !== undefined) {
      json.options.tms = tms;
    }
    return json;
  },

  isValid: function() {
    return this.get('urlTemplate');
  },

  setURLTemplate: function(urlTemplate) {
    return this.set({
      urlTemplate: urlTemplate
    });
  },

  setSubdomains: function(subdomains) {
    return this.set({
      subdomains: subdomains
    });
  },

  setTms: function(tms) {
    return this.set({
      tms: tms
    });
  },

  getURLTemplate: function(urlTemplate) {
    return this.get('urlTemplate');
  },

  getSubdomains: function(subdomains) {
    return this.get('subdomains');
  },

  getTms: function(tms) {
    return this.get('tms');
  }
});


},{}],37:[function(require,module,exports){
cdb.geo.ui.Annotation = cdb.core.View.extend({

  className: "cartodb-overlay overlay-annotation",

  defaults: {
    minZoom: 0,
    maxZoom: 40,
    style: {
      textAlign: "left",
      zIndex: 5,
      color: "#ffffff",
      fontSize: "13",
      fontFamilyName: "Helvetica",
      boxColor: "#333333",
      boxOpacity: 0.7,
      boxPadding: 10,
      lineWidth: 50,
      lineColor: "#333333"
    }
  },

  template: cdb.core.Template.compile(
    '<div class="content">\
    <div class="text widget_text">{{{ text }}}</div>\
    <div class="stick"><div class="ball"></div></div>\
    </div>',
    'mustache'
  ),

  events: {
    "click": "stopPropagation"
  },

  stopPropagation: function(e) {
    e.stopPropagation();
  },

  initialize: function() {

    this.template = this.options.template || this.template;
    this.mapView  = this.options.mapView;

    this.mobileEnabled = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    this._cleanStyleProperties(this.options.style);

    _.defaults(this.options.style, this.defaults.style);

    this._setupModels();

    this._bindMap();

  },

  _setupModels: function() {

    this.model = new cdb.core.Model({ 
      display: true,
      hidden: false,
      text:    this.options.text,
      latlng:  this.options.latlng,
      minZoom: this.options.minZoom || this.defaults.minZoom,
      maxZoom: this.options.maxZoom || this.defaults.maxZoom
    });

    this.model.on("change:display", this._onChangeDisplay, this);
    this.model.on("change:text",    this._onChangeText, this);
    this.model.on('change:latlng',  this._place, this);

    this.model.on('change:minZoom',  this._applyZoomLevelStyle, this);
    this.model.on('change:maxZoom',  this._applyZoomLevelStyle, this);

    this.style = new cdb.core.Model(this.options.style);

    this.style.on("change", this._applyStyle, this);

    this.add_related_model(this.style);

  },

  _bindMap: function() {

    this.mapView.map.bind('change', this._place, this);
    this.mapView.map.bind('change:zoom', this._applyZoomLevelStyle, this);
    this.mapView.bind('zoomstart', this.hide, this);
    this.mapView.bind('zoomend', this.show, this);

  },

  _unbindMap: function() {

    this.mapView.map.unbind('change', this._place, this);
    this.mapView.map.unbind('change:zoom', this._applyZoomLevelStyle, this);
    this.mapView.unbind('zoomstart', this.hide, this);
    this.mapView.unbind('zoomend', this.show, this);

  },

  _onChangeDisplay: function() {

    if (this.model.get("display")) this.show();
    else this.hide();

  },

  _onChangeText: function() {
    this.$el.find(".text").html(this._sanitizedText());
  },

  _sanitizedText: function() {
    return cdb.core.sanitize.html(this.model.get("text"), this.model.get('sanitizeText'));
  },

  _getStandardPropertyName: function(name) {
    if (!name) {
      return;
    }

    var parts = name.split("-");

    if (parts.length === 1) {
      return name;
    } else {
      return parts[0] + _.map(parts.slice(1), function(l) { 
        return l.slice(0,1).toUpperCase() + l.slice(1);
      }).join("");
    }
  },

  _cleanStyleProperties: function(hash) {

    var standardProperties = {};

    _.each(hash, function(value, key) {
      standardProperties[this._getStandardPropertyName(key)] = value;
    }, this);

    this.options.style = standardProperties;

  },

  _belongsToCanvas: function() {
  
    var mobile = (this.options.device === "mobile") ? true : false;
    return mobile === this.mobileEnabled;
  },

  show: function(callback) {

    if (this.model.get("hidden") || !this._belongsToCanvas()) return;

    var self = this;

    this.$el.css({ opacity: 0, display: "inline-table" }); // makes the element to behave fine in the borders of the screen
    this.$el.stop().animate({ opacity: 1 }, { duration: 150, complete: function() {
      callback && callback();
    }});

  },

  hide: function(callback) {
    this.$el.stop().fadeOut(150, function() {
      callback && callback();
    });
  },

  _place: function() {

    var latlng     = this.model.get("latlng");

    var lineWidth  = this.style.get("lineWidth");
    var textAlign  = this.style.get("textAlign");

    var pos        = this.mapView.latLonToPixel(latlng);

    if (pos) {

      var top        = pos.y - this.$el.height()/2;
      var left       = pos.x + lineWidth;

      if (textAlign === "right") {
        left = pos.x - this.$el.width() - lineWidth - this.$el.find(".ball").width();
      }

      this.$el.css({ top: top, left: left });

    }

  },

  setMinZoom: function(zoom) {

    this.model.set("minZoom", zoom);

  },

  setMaxZoom: function(zoom) {

    this.model.set("maxZoom", zoom);

  },

  setPosition: function(latlng) {

    this.model.set("latlng", latlng);

  },

  setText: function(text) {

    this.model.set("text", text);

  },

  setStyle: function(property, value) {

    var standardProperty = this._getStandardPropertyName(property);

    if (standardProperty) {
      this.style.set(standardProperty, value);
    }

  },

  _applyStyle: function() {

    var textColor  = this.style.get("color");
    var textAlign  = this.style.get("textAlign");
    var boxColor   = this.style.get("boxColor");
    var boxOpacity = this.style.get("boxOpacity");
    var boxPadding = this.style.get("boxPadding");
    var lineWidth  = this.style.get("lineWidth");
    var lineColor  = this.style.get("lineColor");
    var fontFamily = this.style.get("fontFamilyName");

    this.$text = this.$el.find(".text");

    this.$text.css({ color: textColor, textAlign: textAlign });

    this.$el.find(".content").css("padding", boxPadding);
    this.$text.css("font-size", this.style.get("fontSize") + "px");
    this.$el.css("z-index", this.style.get("zIndex"));

    this.$el.find(".stick").css({ width: lineWidth, left: -lineWidth });

    var fontFamilyClass = "";

    if      (fontFamily  == "Droid Sans")       fontFamilyClass = "droid";
    else if (fontFamily  == "Vollkorn")         fontFamilyClass = "vollkorn";
    else if (fontFamily  == "Open Sans")        fontFamilyClass = "open_sans";
    else if (fontFamily  == "Roboto")           fontFamilyClass = "roboto";
    else if (fontFamily  == "Lato")             fontFamilyClass = "lato";
    else if (fontFamily  == "Graduate")         fontFamilyClass = "graduate";
    else if (fontFamily  == "Gravitas One")     fontFamilyClass = "gravitas_one";
    else if (fontFamily  == "Old Standard TT")  fontFamilyClass = "old_standard_tt";

    this.$el
    .removeClass("droid")
    .removeClass("vollkorn")
    .removeClass("roboto")
    .removeClass("open_sans")
    .removeClass("lato")
    .removeClass("graduate")
    .removeClass("gravitas_one")
    .removeClass("old_standard_tt");

    this.$el.addClass(fontFamilyClass);

    if (textAlign === "right") {
      this.$el.addClass("align-right");
      this.$el.find(".stick").css({ left: "auto", right: -lineWidth });
    } else {
      this.$el.removeClass("align-right");
    }

    this._place();
    this._applyZoomLevelStyle();

  },

  _getRGBA: function(color, opacity) {
    return 'rgba(' + parseInt(color.slice(-6,-4),16)
    + ',' + parseInt(color.slice(-4,-2),16)
    + ',' + parseInt(color.slice(-2),16)
    + ',' + opacity + ' )';
  },

  _applyZoomLevelStyle: function() {

    var boxColor   = this.style.get("boxColor");
    var boxOpacity = this.style.get("boxOpacity");
    var lineColor  = this.style.get("lineColor");

    var minZoom    = this.model.get("minZoom");
    var maxZoom    = this.model.get("maxZoom");

    var currentZoom = this.mapView.map.get("zoom");

    if (currentZoom >= minZoom && currentZoom <= maxZoom) {

      var rgbaLineCol = this._getRGBA(lineColor, 1);
      var rgbaBoxCol  = this._getRGBA(boxColor, boxOpacity);

      this.$el.find(".text").animate({ opacity: 1 }, 150);

      this.$el.css("background-color", rgbaBoxCol);

      this.$el.find(".stick").css("background-color", rgbaLineCol);
      this.$el.find(".ball").css("background-color", rgbaLineCol);

      this.model.set("hidden", false);
      this.model.set("display", true);

    } else {
      this.model.set("hidden", true);
      this.model.set("display", false);
    }
  },

  clean: function() {
    this._unbindMap();
    cdb.core.View.prototype.clean.call(this);
  },

  _fixLinks: function() {

    this.$el.find("a").each(function(i, link) {
      $(this).attr("target", "_top");
    });

  },

  render: function() {
    var d = _.clone(this.model.attributes);
    d.text = this._sanitizedText();
    this.$el.html(this.template(d));

    this._fixLinks();

    var self = this;
    setTimeout(function() {
      self._applyStyle();
      self._applyZoomLevelStyle();
      self.show();
    }, 500);

    return this;

  }

});

},{}],38:[function(require,module,exports){
/**
 *  FullScreen widget:
 *
 *  var widget = new cdb.ui.common.FullScreen({
 *    doc: ".container", // optional; if not specified, we do the fullscreen of the whole window
 *    template: this.getTemplate("table/views/fullscreen")
 *  });
 *
 */

cdb.ui.common.FullScreen = cdb.core.View.extend({

  tagName: 'div',
  className: 'cartodb-fullscreen',

  events: {
    "click a": "_toggleFullScreen"
  },

  initialize: function() {
    _.bindAll(this, 'render');
    _.defaults(this.options, this.default_options);
    this._addWheelEvent();
  },

  _addWheelEvent: function() {
    var self    = this;
    var mapView = this.options.mapView;

    $(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange', function() {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
        if (self.model.get("allowWheelOnFullscreen")) {
          mapView.options.map.set("scrollwheel", false);
        }
      }
      mapView.invalidateSize();
    });
  },

  _toggleFullScreen: function(ev) {
    if (ev) {
      this.killEvent(ev);
    }

    var doc   = window.document;
    var docEl = doc.documentElement;

    if (this.options.doc) { // we use a custom element
      docEl = $(this.options.doc)[0];
    }

    var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    var mapView = this.options.mapView;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (docEl.webkitRequestFullScreen) {
        // Cartodb.js #361 :: Full screen button not working on Safari 8.0.3 #361
        // Safari has a bug that fullScreen doestn't work with Element.ALLOW_KEYBOARD_INPUT);
        // Reference: Ehttp://stackoverflow.com/questions/8427413/webkitrequestfullscreen-fails-when-passing-element-allow-keyboard-input-in-safar
        requestFullScreen.call(docEl, undefined);
      } else {
        // CartoDB.js #412 :: Fullscreen button is throwing errors
        // Nowadays (2015/03/25), fullscreen is not supported in iOS Safari. Reference: http://caniuse.com/#feat=fullscreen
        if (requestFullScreen) {
          requestFullScreen.call(docEl);
        }
      }

      if (mapView && this.model.get("allowWheelOnFullscreen")) {
        mapView.map.set("scrollwheel", true);
      }
    } else {
      cancelFullScreen.call(doc);
    }
  },

  render: function() {
    var options = _.extend(
      this.options,
      {
        mapUrl: location.href || ''
      }
    );
    this.$el.html(this.options.template(options));

    if (!this._canFullScreenBeEnabled()) {
      this.undelegateEvents();
      cdb.log.info('FullScreen API is deprecated on insecure origins. See https://goo.gl/rStTGz for more details.');
    }

    return this;
  },

  _canFullScreenBeEnabled: function() {
    if (this._isInIframe()) {
      var parentUrl = document.referrer;
      if (parentUrl.search('https:') !== 0) {
        return false;
      }
    }
    return true;
  },

  _isInIframe: function() {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

});

},{}],39:[function(require,module,exports){

cdb.geo.ui.Header = cdb.core.View.extend({

  className: 'cartodb-header',

  initialize: function() {
    var extra = this.model.get("extra");

    this.model.set({
      title:            extra.title,
      description:      extra.description,
      show_title:       extra.show_title,
      show_description: extra.show_description
    }, { silent: true });
  },

  show: function() {
    //var display        = this.model.get("display");
    var hasTitle       = this.model.get("title") && this.model.get("show_title");
    var hasDescription = this.model.get("description") && this.model.get("show_description");

    if (hasTitle || hasDescription) {
      this.$el.show();
      if (hasTitle)       this.$el.find(".content div.title").show();
      if (hasDescription) this.$el.find(".content div.description").show();
    }
  },

  // Add target attribute to all links
  _setLinksTarget: function(str) {
    if (!str) return str;
    var reg = new RegExp(/<(a)([^>]+)>/g);
    return str.replace(reg, "<$1 target=\"_blank\"$2>");
  },

  render: function() {
    var data = _.clone(this.model.attributes);
    data.title = cdb.core.sanitize.html(data.title);
    data.description = this._setLinksTarget(cdb.core.sanitize.html(data.description));
    this.$el.html(this.options.template(data));

    if (this.options.slides) {
      this.slides_controller = new cdb.geo.ui.SlidesController({
        transitions: this.options.transitions,
        slides: this.options.slides
      });

      this.$el.append(this.slides_controller.render().$el);
    }

    if (this.model.get("show_title") || this.model.get("show_description")) {
      this.show();
    } else {
      this.hide();
    }

    return this;

  }

});

},{}],40:[function(require,module,exports){
cdb.geo.ui.Image = cdb.geo.ui.Text.extend({

  className: "cartodb-overlay image-overlay",

  events: {
    "click": "stopPropagation"
  },

  default_options: { },

  stopPropagation: function(e) {

    e.stopPropagation();

  },

  initialize: function() {

    _.defaults(this.options, this.default_options);

    this.template = this.options.template;

    var self = this;

    $(window).on("map_resized", function() {
      self._place();
    });

    $(window).on("resize", function() {
      self._place();
    });

  },

  _applyStyle: function() {

    var style      = this.model.get("style");

    var boxColor   = style["box-color"];
    var boxOpacity = style["box-opacity"];
    var boxWidth   = style["box-width"];

    this.$el.find(".text").css(style);
    this.$el.css("z-index", style["z-index"]);

    var rgbaCol = 'rgba(' + parseInt(boxColor.slice(-6,-4),16)
    + ',' + parseInt(boxColor.slice(-4,-2),16)
    + ',' + parseInt(boxColor.slice(-2),16)
    +', ' + boxOpacity + ' )';

    this.$el.css({
      backgroundColor: rgbaCol
    });

    this.$el.find("img").css({ width: boxWidth });

  },

  render: function() {
    var content;
    if (this.model.get("extra").has_default_image) {
      content = _.template('<img src="<%- url %>" />')({ url: this.model.get("extra").public_default_image_url });
    } else {
      content = cdb.core.sanitize.html(this.model.get("extra").rendered_text, this.model.get('sanitizeContent'));
    }

    var data = _.chain(this.model.attributes).clone().extend({ content: content }).value();
    this.$el.html(this.template(data));

    var self = this;

    setTimeout(function() {
      self._applyStyle();
      self._place();
      self.show();
    }, 900);


    return this;

  }

});

},{}],41:[function(require,module,exports){

cdb.geo.ui.InfoBox = cdb.core.View.extend({

  className: 'cartodb-infobox',
  defaults: {
    pos_margin: 20,
    position: 'bottom|right',
    width: 200
  },

  initialize: function() {
    var self = this;
    _.defaults(this.options, this.defaults);
    if(this.options.layer) {
      this.enable();
    }
    this.setTemplate(this.options.template || this.defaultTemplate, 'mustache');
  },

  setTemplate: function(tmpl) {
    this.template = cdb.core.Template.compile(tmpl, 'mustache');
  },

  enable: function() {
    if(this.options.layer) {
      this.options.layer
        .on('featureOver', function(e, latlng, pos, data) {
          this.render(data).show();
        }, this)
        .on('featureOut', function() {
          this.hide();
        }, this);
    }
  },

  disable: function() {
    if(this.options.layer) {
      this.options.layer.off(null, null, this);
    }
  },

  // set position based on a string like "top|right", "top|left", "bottom|righ"...
  setPosition: function(pos) {
    var props = {};
    if(pos.indexOf('top') !== -1) {
      props.top = this.options.pos_margin;
    } else if(pos.indexOf('bottom') !== -1) {
      props.bottom = this.options.pos_margin;
    }

    if(pos.indexOf('left') !== -1) {
      props.left = this.options.pos_margin;
    } else if(pos.indexOf('right') !== -1) {
      props.right = this.options.pos_margin;
    }
    this.$el.css(props);

  },

  render: function(data) {
    this.$el.html( this.template(data) );
    if(this.options.width) {
      this.$el.css('width', this.options.width);
    }
    if(this.options.position) {
      this.setPosition(this.options.position);
    }
    return this;
  }

});


},{}],42:[function(require,module,exports){
/** Usage:
 *
 * Add Infowindow model:
 *
 * var infowindowModel = new cdb.geo.ui.InfowindowModel({
 *   template_name: 'infowindow_light',
 *   latlng: [72, -45],
 *   offset: [100, 10]
 * });
 *
 * var infowindow = new cdb.geo.ui.Infowindow({
 *   model: infowindowModel,
 *   mapView: mapView
 * });
 *
 * Show the infowindow:
 * infowindow.showInfowindow();
 *
 */

cdb.geo.ui.InfowindowModel = Backbone.Model.extend({

  SYSTEM_COLUMNS: ['the_geom', 'the_geom_webmercator', 'created_at', 'updated_at', 'cartodb_id', 'cartodb_georef_status'],

  defaults: {
    template_name: 'infowindow_light',
    latlng: [0, 0],
    offset: [28, 0], // offset of the tip calculated from the bottom left corner
    maxHeight: 180, // max height of the content, not the whole infowindow
    autoPan: true,
    template: "",
    content: "",
    visibility: false,
    alternative_names: { },
    fields: null // contains the fields displayed in the infowindow
  },

  clearFields: function() {
    this.set({fields: []});
  },

  saveFields: function(where) {
    where = where || 'old_fields';
    this.set(where, _.clone(this.get('fields')));
  },

  fieldCount: function() {
    var fields = this.get('fields')
    if (!fields) return 0;
    return fields.length
  },

  restoreFields: function(whiteList, from) {
    from = from || 'old_fields';
    var fields = this.get(from);
    if(whiteList) {
      fields = fields.filter(function(f) {
        return _.contains(whiteList, f.name);
      });
    }
    if(fields && fields.length) {
      this._setFields(fields);
    }
    this.unset(from);
  },

  _cloneFields: function() {
    return _(this.get('fields')).map(function(v) {
      return _.clone(v);
    });
  },

  _setFields: function(f) {
    f.sort(function(a, b) { return a.position -  b.position; });
    this.set({'fields': f});
  },

  sortFields: function() {
    this.get('fields').sort(function(a, b) { return a.position - b.position; });
  },

  _addField: function(fieldName, at) {
    var dfd = $.Deferred();
    if(!this.containsField(fieldName)) {
      var fields = this.get('fields');
      if(fields) {
        at = at === undefined ? fields.length: at;
        fields.push({ name: fieldName, title: true, position: at });
      } else {
        at = at === undefined ? 0 : at;
        this.set('fields', [{ name: fieldName, title: true, position: at }], { silent: true});
      }
    }
    dfd.resolve();
    return dfd.promise();
  },

  addField: function(fieldName, at) {
    var self = this;
    $.when(this._addField(fieldName, at)).then(function() {
      self.sortFields();
      self.trigger('change:fields');
      self.trigger('add:fields');
    });
    return this;
  },

  getFieldProperty: function(fieldName, k) {
    if(this.containsField(fieldName)) {
      var fields = this.get('fields') || [];
      var idx = _.indexOf(_(fields).pluck('name'), fieldName);
      return fields[idx][k];
    }
    return null;
  },

  setFieldProperty: function(fieldName, k, v) {
    if(this.containsField(fieldName)) {
      var fields = this._cloneFields() || [];
      var idx = _.indexOf(_(fields).pluck('name'), fieldName);
      fields[idx][k] = v;
      this._setFields(fields);
    }
    return this;
  },

  getAlternativeName: function(fieldName) {
    return this.get("alternative_names") && this.get("alternative_names")[fieldName];
  },

  setAlternativeName: function(fieldName, alternativeName) {
    var alternativeNames = this.get("alternative_names") || [];

    alternativeNames[fieldName] = alternativeName;
    this.set({ 'alternative_names': alternativeNames });
    this.trigger('change:alternative_names');
  },

  getFieldPos: function(fieldName) {
    var p = this.getFieldProperty(fieldName, 'position');
    if(p == undefined) {
      return Number.MAX_VALUE;
    }
    return p;
  },

  containsAlternativeName: function(fieldName) {
    var names = this.get('alternative_names') || [];
    return names[fieldName];
  },

  containsField: function(fieldName) {
    var fields = this.get('fields') || [];
    return _.contains(_(fields).pluck('name'), fieldName);
  },

  removeField: function(fieldName) {
    if(this.containsField(fieldName)) {
      var fields = this._cloneFields() || [];
      var idx = _.indexOf(_(fields).pluck('name'), fieldName);
      if(idx >= 0) {
        fields.splice(idx, 1);
      }
      this._setFields(fields);
      this.trigger('remove:fields')
    }
    return this;
  },

  // updates content with attributes
  updateContent: function(attributes) {
    var fields = this.get('fields');
    this.set('content', cdb.geo.ui.InfowindowModel.contentForFields(attributes, fields));
  },

  closeInfowindow: function(){
  if (this.get('visibility')) {
      this.set("visibility", false);
      this.trigger('close');
    }
  }

}, {
  contentForFields: function(attributes, fields, options) {
    options = options || {};
    var render_fields = [];
    for(var j = 0; j < fields.length; ++j) {
      var field = fields[j];
      var value = attributes[field.name];
      if(options.empty_fields || (value !== undefined && value !== null)) {
        render_fields.push({
          title: field.title ? field.name : null,
          value: attributes[field.name],
          index: j
        });
      }
    }

    // manage when there is no data to render
    if (render_fields.length === 0) {
      render_fields.push({
        title: null,
        value: 'No data available',
        index: 0,
        type: 'empty'
      });
    }

    return {
      fields: render_fields,
      data: attributes
    };
  }
});

cdb.geo.ui.Infowindow = cdb.core.View.extend({
  className: "cartodb-infowindow",

  spin_options: {
    lines: 10, length: 0, width: 4, radius: 6, corners: 1, rotate: 0, color: 'rgba(0,0,0,0.5)',
    speed: 1, trail: 60, shadow: false, hwaccel: true, className: 'spinner', zIndex: 2e9,
    top: 'auto', left: 'auto', position: 'absolute'
  },

  events: {
    // Close bindings
    "click .close":         "_closeInfowindow",
    "touchstart .close":    "_closeInfowindow",
    "MSPointerDown .close": "_closeInfowindow",
    // Rest infowindow bindings
    "dragstart":            "_checkOrigin",
    "mousedown":            "_checkOrigin",
    "touchstart":           "_checkOrigin",
    "MSPointerDown":        "_checkOrigin",
    "dblclick":             "_stopPropagation",
    "DOMMouseScroll":       "_stopBubbling",
    'MozMousePixelScroll':  "_stopBubbling",
    "mousewheel":           "_stopBubbling",
    "dbclick":              "_stopPropagation",
    "click":                "_stopPropagation"
  },

  initialize: function(){
    var self = this;

    _.bindAll(this, "render", "setLatLng", "_setTemplate", "_updatePosition",
      "_update", "toggle", "show", "hide");

    this.mapView = this.options.mapView;

    // Set template if it is defined in options
    if (this.options.template) this.model.set('template', this.options.template);

    // Set template view variable and
    // compile it if it is necessary
    if (this.model.get('template')) {
      this._compileTemplate();
    } else {
      this._setTemplate();
    }

    this.model.bind('change:content',             this.render, this);
    this.model.bind('change:template_name',       this._setTemplate, this);
    this.model.bind('change:latlng',              this._update, this);
    this.model.bind('change:visibility',          this.toggle, this);
    this.model.bind('change:template',            this._compileTemplate, this);
    this.model.bind('change:sanitizeTemplate',    this._compileTemplate, this);
    this.model.bind('change:alternative_names',   this.render, this);
    this.model.bind('change:width',               this.render, this);
    this.model.bind('change:maxHeight',           this.render, this);

    this.mapView.map.bind('change',             this._updatePosition, this);

    this.mapView.bind('zoomstart', function(){
      self.hide(true);
    });

    this.mapView.bind('zoomend', function() {
      self.show(true);
    });

    this.add_related_model(this.mapView.map);

    // Hide the element
    this.$el.hide();
  },


  /**
   *  Render infowindow content
   */
  render: function() {

    if(this.template) {

      // If there is content, destroy the jscrollpane first, then remove the content.
      var $jscrollpane = this.$(".cartodb-popup-content");
      if ($jscrollpane.length > 0 && $jscrollpane.data() != null) {
        $jscrollpane.data().jsp && $jscrollpane.data().jsp.destroy();
      }

      // Clone fields and template name
      var fields = _.map(this.model.attributes.content.fields, function(field){
        return _.clone(field);
      });
      var data = this.model.get('content') ? this.model.get('content').data : {};

      // If a custom template is not applied, let's sanitized
      // fields for the template rendering
      if (this.model.get('template_name')) {
        var template_name = _.clone(this.model.attributes.template_name);

        // Sanitized them
        fields = this._fieldsToString(fields, template_name);
      }

      // Join plan fields values with content to work with
      // custom infowindows and CartoDB infowindows.
      var values = {};
      _.each(this.model.get('content').fields, function(pair) {
        values[pair.title] = pair.value;
      })

      var obj = _.extend({
          content: {
            fields: fields,
            data: data
          }
        },values);

      this.$el.html(
        cdb.core.sanitize.html(this.template(obj), this.model.get('sanitizeTemplate'))
      );

      // Set width and max-height from the model only
      // If there is no width set, we don't force our infowindow
      if (this.model.get('width')) {
        this.$('.cartodb-popup').css('width', this.model.get('width') + 'px');
      }
      this.$('.cartodb-popup .cartodb-popup-content').css('max-height', this.model.get('maxHeight') + 'px');

      // Hello jscrollpane hacks!
      // It needs some time to initialize, if not it doesn't render properly the fields
      // Check the height of the content + the header if exists
      var self = this;
      setTimeout(function() {
        var actual_height = self.$(".cartodb-popup-content").outerHeight();
        if (self.model.get('maxHeight') <= actual_height)
          self.$(".cartodb-popup-content").jScrollPane({
            verticalDragMinHeight: 20,
            autoReinitialise: true
          });
      }, 1);

      // If the infowindow is loading, show spin
      this._checkLoading();

      // If the template is 'cover-enabled', load the cover
      this._loadCover();

      if(!this.isLoadingData()) {
        this.model.trigger('domready', this, this.$el);
        this.trigger('domready', this, this.$el);
      }
    }

    return this;
  },

  _getModelTemplate: function() {
    return this.model.get("template_name")
  },

  /**
   *  Change template of the infowindow
   */
  _setTemplate: function() {
    if (this.model.get('template_name')) {
      this.template = cdb.templates.getTemplate(this._getModelTemplate());
      this.render();
    }
  },

  /**
   *  Compile template of the infowindow
   */
  _compileTemplate: function() {
    var template = this.model.get('template') ?
      this.model.get('template') :
      cdb.templates.getTemplate(this._getModelTemplate());

    if(typeof(template) !== 'function') {
      this.template = new cdb.core.Template({
        template: template,
        type: this.model.get('template_type') || 'mustache'
      }).asFunction()
    } else {
      this.template = template
    }

    this.render();
  },

  /**
   *  Check event origin
   */
  _checkOrigin: function(ev) {
    // If the mouse down come from jspVerticalBar
    // dont stop the propagation, but if the event
    // is a touchstart, stop the propagation
    var come_from_scroll = (($(ev.target).closest(".jspVerticalBar").length > 0) && (ev.type != "touchstart"));

    if (!come_from_scroll) {
      ev.stopPropagation();
    }
  },

  /**
   *  Convert values to string unless value is NULL
   */
  _fieldsToString: function(fields, template_name) {
    var fields_sanitized = [];
    if (fields && fields.length > 0) {
      var self = this;
      fields_sanitized = _.map(fields, function(field,i) {
        // Return whole attribute sanitized
        return self._sanitizeField(field, template_name, field.index || i);
      });
    }
    return fields_sanitized;
  },

  /**
   *  Sanitize fields, what does it mean?
   *  - If value is null, transform to string
   *  - If value is an url, add it as an attribute
   *  - Cut off title if it is very long (in header or image templates).
   *  - If the value is a valid url, let's make it a link.
   *  - More to come...
   */
  _sanitizeField: function(attr, template_name, pos) {
    // Check null or undefined :| and set both to empty == ''
    if (attr.value == null || attr.value == undefined) {
      attr.value = '';
    }

    //Get the alternative title
    var alternative_name = this.model.getAlternativeName(attr.title);

    if (attr.title && alternative_name) {
      // Alternative title
      attr.title = alternative_name;
    } else if (attr.title) {
      // Remove '_' character from titles
      attr.title = attr.title.replace(/_/g,' ');
    }

    // Cast all values to string due to problems with Mustache 0 number rendering
    var new_value = attr.value.toString();

    // If it is index 0, not any field type, header template type and length bigger than 30... cut off the text!
    if (!attr.type && pos==0 && attr.value.length > 35 && template_name && template_name.search('_header_') != -1) {
      new_value = attr.value.substr(0,32) + "...";
    }

    // If it is index 1, not any field type, header image template type and length bigger than 30... cut off the text!
    if (!attr.type && pos==1 && attr.value.length > 35 && template_name && template_name.search('_header_with_image') != -1) {
      new_value = attr.value.substr(0,32) + "...";
    }

    // Is it the value a link?
    if (this._isValidURL(attr.value)) {
      new_value = "<a href='" + attr.value + "' target='_blank'>" + new_value + "</a>"
    }

    // If it is index 0, not any field type, header image template type... don't cut off the text or add any link!!
    if (pos==0 && template_name.search('_header_with_image') != -1) {
      new_value = attr.value;
    }

    // Save new sanitized value
    attr.value = new_value;

    return attr;
  },

  isLoadingData: function() {
    var content = this.model.get("content");
    return content.fields && content.fields.length == 1 && content.fields[0].type === "loading";
  },

  /**
   *  Check if infowindow is loading the row content
   */
  _checkLoading: function() {
    if (this.isLoadingData()) {
      this._startSpinner();
    } else {
      this._stopSpinner();
    }
  },

  /**
   *  Stop loading spinner
   */
  _stopSpinner: function() {
    if (this.spinner)
      this.spinner.stop()
  },

  /**
   *  Start loading spinner
   */
  _startSpinner: function($el) {
    this._stopSpinner();

    var $el = this.$el.find('.loading');

    if ($el) {
      // Check if it is dark or other to change color
      var template_dark = this.model.get('template_name').search('dark') != -1;

      if (template_dark) {
        this.spin_options.color = '#FFF';
      } else {
        this.spin_options.color = 'rgba(0,0,0,0.5)';
      }

      this.spinner = new Spinner(this.spin_options).spin();
      $el.append(this.spinner.el);
    }
  },

  /**
   *  Stop loading spinner
   */
  _containsCover: function() {
    return this.$el.find(".cartodb-popup.header").attr("data-cover") ? true : false;
  },


  /**
   *  Get cover URL
   */
  _getCoverURL: function() {
    var content = this.model.get("content");

    if (content && content.fields && content.fields.length > 0) {
      return (content.fields[0].value || '').toString();
    }

    return false;
  },

  /**
   *  Attempts to load the cover URL and show it
   */
  _loadCover: function() {

    if (!this._containsCover()) return;

    var self = this;
    var $cover = this.$(".cover");
    var $img = $cover.find("img");
    var $shadow = this.$(".shadow");
    var url = this._getCoverURL();

    if (!this._isValidURL(url)) {
      $img.hide();
      $shadow.hide();
      cdb.log.info("Header image url not valid");
      return;
    }

    // configure spinner
    var target  = document.getElementById('spinner');
    var opts    = { lines: 9, length: 4, width: 2, radius: 4, corners: 1, rotate: 0, color: '#ccc', speed: 1, trail: 60, shadow: true, hwaccel: false, zIndex: 2e9 };
    var spinner = new Spinner(opts).spin(target);

    // create the image

    $img.hide(function() {
      this.remove();
    });

    $img = $("<img />").attr("src", url);
    $cover.append($img);

    $img.load(function(){
      spinner.stop();

      var w  = $img.width();
      var h  = $img.height();
      var coverWidth = $cover.width();
      var coverHeight = $cover.height();

      var ratio = h / w;
      var coverRatio = coverHeight / coverWidth;

      // Resize rules
      if ( w > coverWidth && h > coverHeight) { // bigger image
        if ( ratio < coverRatio ) $img.css({ height: coverHeight });
        else {
          var calculatedHeight = h / (w / coverWidth);
          $img.css({ width: coverWidth, top: "50%", position: "absolute", "margin-top": -1*parseInt(calculatedHeight, 10)/2 });
        }
      } else {
        var calculatedHeight = h / (w / coverWidth);
        $img.css({ width: coverWidth, top: "50%", position: "absolute", "margin-top": -1*parseInt(calculatedHeight, 10)/2 });
      }

      $img.fadeIn(300);
    })
    .error(function(){
      spinner.stop();
    });
  },

  /**
   *  Return true if the provided URL is valid
   */
  _isValidURL: function(url) {
    if (url) {
      var urlPattern = /^(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-|]*[\w@?^=%&amp;\/~+#-])?$/
      return String(url).match(urlPattern) != null ? true : false;
    }

    return false;
  },

  /**
   *  Toggle infowindow visibility
   */
  toggle: function() {
    this.model.get("visibility") ? this.show() : this.hide();
  },

  /**
   *  Stop event bubbling
   */
  _stopBubbling: function (e) {
    e.preventDefault();
    e.stopPropagation();
  },

  /**
   *  Stop event propagation
   */
  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  /**
   *  Set loading state adding its content
   */
  setLoading: function() {
    this.model.set({
      content:  {
        fields: [{
          title: null,
          alternative_name: null,
          value: 'Loading content...',
          index: null,
          type: "loading"
        }],
        data: {}
      }
    })
    return this;
  },

  /**
   *  Set loading state adding its content
   */
  setError: function() {
    this.model.set({
      content:  {
        fields: [{
          title: null,
          alternative_name: null,
          value: 'There has been an error...',
          index: null,
          type: 'error'
        }],
        data: {}
      }
    })
    return this;
  },

  /**
   * Set the correct position for the popup
   */
  setLatLng: function (latlng) {
    this.model.set("latlng", latlng);
    return this;
  },

  /**
   *  Close infowindow
   */
  _closeInfowindow: function(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (this.model.get("visibility")) {
       this.model.set("visibility", false);
       this.trigger('close');
    }
  },

  /**
   *  Set visibility infowindow
   */
  showInfowindow: function() {
    this.model.set("visibility", true);
  },

  /**
   *  Show infowindow (update, pan, etc)
   */
  show: function (no_pan) {
    var self = this;

    if (this.model.get("visibility")) {
      self.$el.css({ left: -5000 });
      self._update(no_pan);
    }
  },

  /**
   *  Get infowindow visibility
   */
  isHidden: function () {
    return !this.model.get("visibility");
  },

  /**
   *  Set infowindow to hidden
   */
  hide: function (force) {
    if (force || !this.model.get("visibility")) this._animateOut();
  },

  /**
   *  Update infowindow
   */
  _update: function (no_pan) {

    if(!this.isHidden()) {
      var delay = 0;

      if (!no_pan) {
        var delay = this.adjustPan();
      }

      this._updatePosition();
      this._animateIn(delay);
    }
  },

  /**
   *  Animate infowindow to show up
   */
  _animateIn: function(delay) {
    if (!cdb.core.util.ie || (cdb.core.util.browser.ie && cdb.core.util.browser.ie.version > 8)) {
      this.$el.css({
        'marginBottom':'-10px',
        'display':'block',
        opacity:0
      });

      this.$el
      .delay(delay)
      .animate({
        opacity: 1,
        marginBottom: 0
      },300);
    } else {
      this.$el.show();
    }
  },

  /**
   *  Animate infowindow to disappear
   */
  _animateOut: function() {
    if (!$.browser.msie || ($.browser.msie && parseInt($.browser.version) > 8 )) {
      var self = this;
      this.$el.animate({
        marginBottom: "-10px",
        opacity:      "0",
        display:      "block"
      }, 180, function() {
        self.$el.css({display: "none"});
      });
    } else {
      this.$el.hide();
    }
  },

  /**
   *  Update the position (private)
   */
  _updatePosition: function () {
    if(this.isHidden()) return;

    var
    offset          = this.model.get("offset")
    pos             = this.mapView.latLonToPixel(this.model.get("latlng")),
    x               = this.$el.position().left,
    y               = this.$el.position().top,
    containerHeight = this.$el.outerHeight(true),
    containerWidth  = this.$el.width(),
    left            = pos.x - offset[0],
    size            = this.mapView.getSize(),
    bottom          = -1*(pos.y - offset[1] - size.y);

    this.$el.css({ bottom: bottom, left: left });
  },

  /**
   *  Adjust pan to show correctly the infowindow
   */
  adjustPan: function (callback) {
    var offset = this.model.get("offset");

    if (!this.model.get("autoPan") || this.isHidden()) { return; }

    var
    x               = this.$el.position().left,
    y               = this.$el.position().top,
    containerHeight = this.$el.outerHeight(true) + 15, // Adding some more space
    containerWidth  = this.$el.width(),
    pos             = this.mapView.latLonToPixel(this.model.get("latlng")),
    adjustOffset    = {x: 0, y: 0};
    size            = this.mapView.getSize()
    wait_callback   = 0;

    if (pos.x - offset[0] < 0) {
      adjustOffset.x = pos.x - offset[0] - 10;
    }

    if (pos.x - offset[0] + containerWidth > size.x) {
      adjustOffset.x = pos.x + containerWidth - size.x - offset[0] + 10;
    }

    if (pos.y - containerHeight < 0) {
      adjustOffset.y = pos.y - containerHeight - 10;
    }

    if (pos.y - containerHeight > size.y) {
      adjustOffset.y = pos.y + containerHeight - size.y;
    }

    if (adjustOffset.x || adjustOffset.y) {
      this.mapView.panBy(adjustOffset);
      wait_callback = 300;
    }

    return wait_callback;
  }

});

},{}],43:[function(require,module,exports){

/**
 *  Layer selector: it allows to select the layers that will be shown in the map
 *  - It needs the mapview, the element template and the dropdown template
 *
 *  var layer_selector = new cdb.geo.ui.LayerSelector({
 *    mapView: mapView,
 *    template: element_template,
 *    dropdown_template: dropdown_template
 *  });
 */

cdb.geo.ui.LayerSelector = cdb.core.View.extend({

  className: 'cartodb-layer-selector-box',

  events: {
    "click":     '_openDropdown',
    "dblclick":  'killEvent',
    "mousedown": 'killEvent'
  },

  initialize: function() {
    this.map = this.options.mapView.map;

    this.mapView  = this.options.mapView;
    this.mapView.bind('click zoomstart drag', function() {
      this.dropdown && this.dropdown.hide()
    }, this);
    this.add_related_model(this.mapView);

    this.layers = [];
  },

  render: function() {

    this.$el.html(this.options.template(this.options));

    this.dropdown = new cdb.ui.common.Dropdown({
      className:"cartodb-dropdown border",
      template: this.options.dropdown_template,
      target: this.$el.find("a"),
      speedIn: 300,
      speedOut: 200,
      position: "position",
      tick: "right",
      vertical_position: "down",
      horizontal_position: "right",
      vertical_offset: 7,
      horizontal_offset: 13
    });

    if (cdb.god) cdb.god.bind("closeDialogs", this.dropdown.hide, this.dropdown);

    this.$el.append(this.dropdown.render().el);

    this._getLayers();
    this._setCount();

    return this;
  },

  _getLayers: function() {
    var self = this;
    this.layers = [];

    _.each(this.map.layers.models, function(layer) {

      if (layer.get("type") == 'layergroup' || layer.get('type') === 'namedmap') {
        var layerGroupView = self.mapView.getLayerByCid(layer.cid);
        for (var i = 0 ; i < layerGroupView.getLayerCount(); ++i) {
          var l = layerGroupView.getLayer(i);
          var m = new cdb.core.Model(l);
          m.set('order', i);
          m.set('type', 'layergroup');

          if (m.get("visible") === undefined) m.set('visible', true);

          m.bind('change:visible', function(model) {
            this.trigger("change:visible", model.get('visible'), model.get('order'), model);
          }, self);

          if(self.options.layer_names) {
            m.set('layer_name', self.options.layer_names[i]);
          } else {
            m.set('layer_name', l.options.layer_name);
          }

          var layerView = self._createLayer('LayerViewFromLayerGroup', {
            model: m,
            layerView: layerGroupView,
            layerIndex: i
          });
          layerView.bind('switchChanged', self._setCount, self);
          self.layers.push(layerView);
        }
      } else if (layer.get("type") === "CartoDB" || layer.get('type') === 'torque') {
        var layerView = self._createLayer('LayerView', { model: layer });
        layerView.bind('switchChanged', self._setCount, self);
        self.layers.push(layerView);
        layerView.model.bind('change:visible', function(model) {
          this.trigger("change:visible", model.get('visible'), model.get('order'), model);
        }, self);
      }

    });
  },

  _createLayer: function(_class, opts) {
    var layerView = new cdb.geo.ui[_class](opts);
    this.$("ul").append(layerView.render().el);
    this.addView(layerView);
    return layerView;
  },

  _setCount: function() {
    var count = 0;
    for (var i = 0, l = this.layers.length; i < l; ++i) {
      var lyr = this.layers[i];

      if (lyr.model.get('visible')) {
        count++;
      }
    }

    this.$('.count').text(count);
    this.trigger("switchChanged", this);
  },

  _openDropdown: function() {
    this.dropdown.open();
  }

});






/**
 *  View for each CartoDB layer
 *  - It needs a model to make it work.
 *
 *  var layerView = new cdb.geo.ui.LayerView({
 *    model: layer_model,
 *    layer_definition: layer_definition
 *  });
 *
 */

cdb.geo.ui.LayerView = cdb.core.View.extend({

  tagName: "li",

  defaults: {
    template: '\
      <a class="layer" href="#/change-layer"><%- layer_name %></a>\
      <a href="#switch" class="right <%- visible ? "enabled" : "disabled" %> switch"><span class="handle"></span></a>\
    '
  },

  events: {
    "click": '_onSwitchClick'
  },

  initialize: function() {

    if (!this.model.has('visible')) this.model.set('visible', false);

    this.model.bind("change:visible", this._onSwitchSelected, this);

    this.add_related_model(this.model);

    this._onSwitchSelected();

    // Template
    this.template = this.options.template ? cdb.templates.getTemplate(this.options.template) : _.template(this.defaults.template);
  },

  render: function() {
    var attrs = _.clone(this.model.attributes);
    attrs.layer_name = attrs.layer_name || attrs.table_name;
    this.$el.append(this.template(attrs));
    return this;
  },

  /*
  * Throw an event when the user clicks in the switch button
  */
  _onSwitchSelected: function() {
    var enabled = this.model.get('visible');

    // Change switch
    this.$el.find(".switch")
      .removeClass(enabled ? 'disabled' : 'enabled')
      .addClass(enabled    ? 'enabled'  : 'disabled');

    // Send trigger
    this.trigger('switchChanged');

  },

  _onSwitchClick: function(e){
    this.killEvent(e);

    // Set model
    this.model.set("visible", !this.model.get("visible"));
  }

});

/**
 *  View for each layer from a layer group
 *  - It needs a model and the layer_definition to make it work.
 *
 *  var layerView = new cdb.geo.ui.LayerViewFromLayerGroup({
 *    model: layer_model,
 *    layerView: layweView
 *  });
 *
 */

cdb.geo.ui.LayerViewFromLayerGroup = cdb.geo.ui.LayerView.extend({

  _onSwitchSelected: function() {

    cdb.geo.ui.LayerView.prototype._onSwitchSelected.call(this);
    var sublayer = this.options.layerView.getSubLayer(this.options.layerIndex)
    var visible = this.model.get('visible');

    if (visible) {
      sublayer.show();
    } else {
      sublayer.hide();
    }
  }
});

},{}],44:[function(require,module,exports){

// MODELS & COLLECTIONS

/*
 * Model for the legend item
 *
 * */
cdb.geo.ui.LegendItemModel = cdb.core.Model.extend({

  defaults: {
    name: "Untitled",
    visible:true,
    value: ""
  }

});

/*
 * Collection of items for a legend
 *
 * */
cdb.geo.ui.LegendItems = Backbone.Collection.extend({
  model: cdb.geo.ui.LegendItemModel
});


/*
 * Legend Model
 *
 **/
cdb.geo.ui.LegendModel = cdb.core.Model.extend({

  defaults: {
    type: null,
    show_title: false,
    title: "",
    template: "",
    visible: true
  },

  initialize: function() {

    this.items = new cdb.geo.ui.LegendItems(this.get("items"));

    this.items.bind("add remove reset change", function() {
      this.set({ items: this.items.toJSON() });
    }, this);

    this.bind("change:items", this._onUpdateItems, this);
    this.bind("change:title change:show_title", this._onUpdateTitle, this);
    this.bind("change:template", this._onUpdateTemplate, this);

  },

  _onUpdateTemplate: function() {
    this.template = this.get("template");
  },

  _onUpdateTitle: function() {
    this.title = this.get("title");
    this.show_title = this.get("show_title");
  },

  _onUpdateItems: function() {
    var items = this.get("items");
    this.items.reset(items);
  }

});

cdb.geo.ui.Legends = Backbone.Collection.extend({
  model: cdb.geo.ui.LegendModel
});

// VIEWS

/*
 * Legend item
 *
 * */
cdb.geo.ui.LegendItem = cdb.core.View.extend({

  tagName: "li",

  initialize: function() {

    _.bindAll(this, "render");

    this.template = this.options.template ? _.template(this.options.template) : cdb.templates.getTemplate('geo/legend');

  },

  render: function() {

    var value;
    this.model.attributes.name = ""+this.model.attributes.name;
    if (this.model.get("type") == 'image' && this.model.get("value")) {
      value = "url( " + this.model.get("value") + ")";
    } else {
      value = this.model.get("value");
    }

    var options = _.extend( this.model.toJSON(), { value: value });

    this.$el.html(this.template(options));

    return this.$el;
  }

});

/*
 * Legend View: wrapper for the different types of lengeds
 *
 * */
cdb.geo.ui.Legend = cdb.core.View.extend({

  className: "cartodb-legend",

  events: {
    "dragstart":            "_stopPropagation",
    "mousedown":            "_stopPropagation",
    "touchstart":           "_stopPropagation",
    "MSPointerDown":        "_stopPropagation",
    "dblclick":             "_stopPropagation",
    "mousewheel":           "_stopPropagation",
    "DOMMouseScroll":       "_stopPropagation",
    "dbclick":              "_stopPropagation",
    "click":                "_stopPropagation"
  },

  initialize: function() {
    _.bindAll(this, "render", "show", "hide");

    _.defaults(this.options, this.default_options);

    this.map = this.options.map;

    this._setupModel();
    this._setupItems();

    this._updateLegendType();
  },

  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  _setupModel: function() {
    if (!this.model) {

      this.model = new cdb.geo.ui.LegendModel({
        type: this.options.type || cdb.geo.ui.LegendModel.prototype.defaults.type,
        title: this.options.title || cdb.geo.ui.LegendModel.prototype.defaults.title,
        show_title: this.options.show_title || cdb.geo.ui.LegendModel.prototype.defaults.show_title,
        template: this.options.template || cdb.geo.ui.LegendModel.prototype.defaults.template
      });
    }

    this.add_related_model(this.model);

    //this.model.bind("change:template change:type change:items change:title change:show_title",  this._updateLegendType, this);
    this.model.bind("change",  this._updateLegendType, this);
  },

  _updateLegendType: function() {
    var type = this.model.get("type");
    this.legend_name = this._capitalize(type) + "Legend";

    if (type == 'none' || type == null) {
      this.legend_name = null;
      this.model.set({ type: "none" }, { silent: true });
    } else if (!cdb.geo.ui[this.legend_name]) {

      // set the previous type
      this.legend_name = null;
      this.model.set({ type: this.model.previous("type") }, { silent: true });
      return;
    }

    this._refresh();
  },

  _capitalize: function(string) {
    if (string && _.isString(string)) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    }
  },

  _refresh: function() {
    var self = this;

    if (this.view) this.view.clean();

    var type  = this.model.get("type");
    var title = this.model.get("title");
    var show_title = this.model.get("show_title");
    var template = this.model.get("template");

    if (type && this.legend_name) {
      this.view = new cdb.geo.ui[this.legend_name]({
        model: this.model
      });

      // Set the type as the element class for styling
      this.$el.removeClass();
      this.$el.addClass(this.className + " " + this.model.get("type"));
    } else {
      this.hide();

      this.$el.removeClass();
      this.$el.addClass(this.className + " none");
    }

    this.render();
  },

  _setupItems: function() {
    var self = this;

    this.items = this.model.items;

    if (this.options.data) {
      this.items.reset(this.options.data);
    }

    this.items.bind("add remove change:value change:name", this.render, this);
  },

  render: function() {
    if (this.view) {

      if (this.model.get("template")) {
        this.$el.html(this.view.render().$el.html());
        this.$el.removeClass(this.model.get("type"))
        this.$el.addClass("wrapper");
      } else {
        this.$el.html(this.view.render().$el.html());
      }

      if (this.model.get("visible") === false) {
        this.hide();
      } else {
        this.show();
      }
    }

    return this;
  },

  show: function(callback) {
    var type = this.model.get("type");
    if (type && type != "none") this.$el.show();
  },

  hide: function(callback) {
    if (this.model.get("type")) this.$el.hide();
  }
});

/*
 * DebugLegend
 *
 * */
cdb.geo.ui.DebugLegend = cdb.core.View.extend({ });

/*
 * BaseLegend: common methods for all the legends
 *
 * */
cdb.geo.ui.BaseLegend = cdb.core.View.extend({

  _bindModel: function() {

    this.model.bind("change:template change:title change:show_title", this.render, this);

  },

  addTo: function(element) {
    $(element).html(this.render().$el);
  },

  setTitle: function(title) {
    this.model.set("title", title);
  },

  showTitle: function() {
    this.model.set("show_title", true);
  },

  hideTitle: function() {
    this.model.set("show_title", false);
  }

});

/*
 * NoneLegend
 *
 * */
cdb.geo.ui.NoneLegend  = cdb.geo.ui.BaseLegend.extend({ });
cdb.geo.ui.Legend.None = cdb.core.View.extend({ });

/*
 * ChoroplethLegend
 *
 * */
cdb.geo.ui.ChoroplethLegend = cdb.geo.ui.BaseLegend.extend({

  className: "choropleth-legend",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul><li class="min">\t\t<%- leftLabel %></li><li class="max">\t\t<%- rightLabel %></li><li class="graph count_<%- buckets_count %>">\t<div class="colors"><%= colors %>\n\t</div></li></ul>'),

  initialize: function() {

    this.items    = this.model.items;

  },

  _generateColorList: function() {

    var colors = "";

    if (this.model.get("colors")) {
      return _.map(this.model.get("colors"), function(color) {
        return '\n\t<div class="quartile" style="background-color:' + color + '"></div>';
      }).join("");
    } else {

      for (var i = 2; i < this.items.length; i++) {
        var color = this.items.at(i).get("value");
        colors += '\n\t<div class="quartile" style="background-color:'+color+'"></div>';
      }
    }

    return colors;

  },

  setLeftLabel: function(text) {

    this.model.set("leftLabel", text);

  },

  setRightLabel: function(text) {

    this.model.set("rightLabel", text);

  },

  setColors: function(colors) {

    this.model.set("colors", colors);

  },

  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

    } else {


      if (this.items.length >= 2) {

        this.leftLabel  = this.items.at(0);
        this.rightLabel = this.items.at(1);

        var leftLabel   = this.model.get("leftLabel")  || this.leftLabel.get("value");
        var rightLabel  = this.model.get("rightLabel") || this.rightLabel.get("value");

        var colors = this._generateColorList();

        var options = _.extend( this.model.toJSON(), { leftLabel: leftLabel, rightLabel: rightLabel, colors: colors, buckets_count: colors.length });

        this.$el.html(this.template(options));
      }
    }

    return this;

  }

});

/*
 * DensityLegend
 *
 * */
cdb.geo.ui.DensityLegend = cdb.geo.ui.BaseLegend.extend({

  className: "density-legend",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul><li class="min">\t<%- leftLabel %></li><li class="max">\t<%- rightLabel %></li><li class="graph count_<%- buckets_count %>">\t<div class="colors"><%= colors %>\n\t</div></li></ul>'),

  initialize: function() {

    this.items    = this.model.items;

  },

  setLeftLabel: function(text) {

    this.model.set("leftLabel", text);

  },

  setRightLabel: function(text) {

    this.model.set("rightLabel", text);

  },

  setColors: function(colors) {

    this.model.set("colors", colors);

  },

  _generateColorList: function() {

    var colors = "";

    if (this.model.get("colors")) {

      return _.map(this.model.get("colors"), function(color) {
        return '\n\t\t<div class="quartile" style="background-color:' + color + '"></div>';
      }).join("");

    } else {

      for (var i = 2; i < this.items.length; i++) {
        var color = this.items.at(i).get("value");
        colors += '\n\t\t<div class="quartile" style="background-color:'+color+'"></div>';
      }
    }

    return colors;

  },


  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

    } else {

      if (this.items.length >= 2) {

        this.leftLabel  = this.items.at(0);
        this.rightLabel = this.items.at(1);

        var leftLabel  = this.model.get("leftLabel")  || this.leftLabel.get("value");
        var rightLabel = this.model.get("rightLabel") || this.rightLabel.get("value");

        var colors = this._generateColorList();

        var options = _.extend( this.model.toJSON(), { leftLabel: leftLabel, rightLabel: rightLabel, colors: colors, buckets_count: colors.length });

        this.$el.html(this.template(options));
      }
    }

    return this;

  }

});

/*
 * Density Legend public interface
 *
 * */
cdb.geo.ui.Legend.Density = cdb.geo.ui.DensityLegend.extend({

  type: "density",

  className: "cartodb-legend density",

  initialize: function() {

    this.items    = this.options.items;

    this.model = new cdb.geo.ui.LegendModel({
      type:          this.type,
      title:         this.options.title,
      show_title:    this.options.title ? true : false,
      leftLabel:     this.options.left || this.options.leftLabel,
      rightLabel:    this.options.right || this.options.rightLabel,
      colors:        this.options.colors,
      buckets_count: this.options.colors ? this.options.colors.length : 0,
      items:        this.options.items
    });

    this._bindModel();

  },

  _bindModel: function() {

    this.model.bind("change:colors change:template change:title change:show_title change:colors change:leftLabel change:rightLabel", this.render, this);

  },

  _generateColorList: function() {

    return _.map(this.model.get("colors"), function(color) {
      return '<div class="quartile" style="background-color:' + color + '"></div>';
    }).join("");

  },

  render: function() {

    var options = _.extend(this.model.toJSON(), { colors: this._generateColorList() });

    this.$el.html(this.template(options));

    return this;

  }

});

/*
 * IntensityLegend
 *
 * */
cdb.geo.ui.IntensityLegend = cdb.geo.ui.BaseLegend.extend({

  className: "intensity-legend",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul><li class="min">\t<%- leftLabel %></li><li class="max">\t<%- rightLabel %></li><li class="graph"></li></ul>'),

  initialize: function() {

    this.items       = this.model.items;

  },

  _bindModel: function() {

    this.model.bind("change:template", this.render, this);

  },

  setColor: function(color) {

    this.model.set("color", color);

  },

  setLeftLabel: function(text) {

    this.model.set("leftLabel", text);

  },

  setRightLabel: function(text) {

    this.model.set("rightLabel", text);

  },

  _hexToRGB: function(hex) {

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;

  },

  _rgbToHex: function(r, g, b) {

    function componentToHex(c) {
      var hex = c.toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    }

    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
  },

  _calculateMultiply: function(color, steps) {

    var colorHex = this._hexToRGB(color);

    if (colorHex) {

      var r = colorHex.r;
      var g = colorHex.g;
      var b = colorHex.b;

      for (var i = 0; i <= steps; i++) {
        r = Math.round(r * colorHex.r/255);
        g = Math.round(g * colorHex.g/255);
        b = Math.round(b * colorHex.b/255);
      }

      return this._rgbToHex(r,g,b);

    }

    return "#ffffff";

  },

  _renderGraph: function(baseColor) {

    var s = "";

    s+= "background: <%= color %>;";
    s+= "background: -moz-linear-gradient(left, <%= color %> 0%, <%= right %> 100%);";
    s+= "background: -webkit-gradient(linear, left top, right top, color-stop(0%,<%= color %>), color-stop(100%,<%= right %>));";
    s+= "background: -webkit-linear-gradient(left, <%= color %> 0%,<%= right %> 100%);";
    s+= "background: -o-linear-gradient(left, <%= color %> 0%,<%= right %> 100%);";
    s+= "background: -ms-linear-gradient(left, <%= color %> 0%,<%= right %> 100%)";
    s+= "background: linear-gradient(to right, <%= color %> 0%,<%= right %> 100%);";
    s+= "filter: progid:DXImageTransform.Microsoft.gradient( startColorstr='<%= color %>', endColorstr='<%= right %>',GradientType=1 );";
    s+= "background-image: -ms-linear-gradient(left, <%= color %> 0%,<%= right %> 100%)";

    var backgroundStyle = _.template(s);

    var multipliedColor = this._calculateMultiply(baseColor, 4);

    this.$el.find(".graph").attr("style", backgroundStyle({ color: baseColor, right: multipliedColor }));

  },

  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

    } else {

      if (this.items.length >= 3) {

        this.leftLabel  = this.items.at(0);
        this.rightLabel = this.items.at(1);
        var color       = this.model.get("color") || this.items.at(2).get("value");

        var leftLabel   = this.model.get("leftLabel")  || this.leftLabel.get("value");
        var rightLabel  = this.model.get("rightLabel") || this.rightLabel.get("value");

        var options = _.extend( this.model.toJSON(), { color: color, leftLabel: leftLabel, rightLabel: rightLabel });

        this.$el.html(this.template(options));

        this._renderGraph(color);
      }

    }

    return this;

  }

});

/*
 * CategoryLegend
 *
 * */
cdb.geo.ui.CategoryLegend = cdb.geo.ui.BaseLegend.extend({

  className: "category-legend",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul></ul>'),

  initialize: function() {

    this.items = this.model.items;

  },

  _bindModel: function() {

    this.model.bind("change:title change:show_title change:template", this.render, this);

  },

  _renderItems: function() {

    this.items.each(this._renderItem, this);

  },

  _renderItem: function(item) {

    view = new cdb.geo.ui.LegendItem({
      model: item,
      className: (item.get("value") && item.get("value").indexOf("http") >= 0 || item.get("type") && item.get("type") == 'image') ? "bkg" : "",
      template: '\t\t<div class="bullet" style="background: <%= value %>"></div> <%- name || ((name === false) ? "false": "null") %>'
    });

    this.$el.find("ul").append(view.render());

  },

  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

    } else {

      this.$el.html(this.template(this.model.toJSON()));

      if (this.items.length > 0) {
        this._renderItems();
      } else {
        this.$el.html('<div class="warning">The category legend is empty</div>');
      }
    }

    return this;

  }

});

/*
 * Category Legend public interface
 *
 * */
cdb.geo.ui.Legend.Category = cdb.geo.ui.CategoryLegend.extend({

  className: "cartodb-legend category",

  type: "category",

  initialize: function() {

    this.items = new cdb.geo.ui.LegendItems(this.options.data);

    this.model = new cdb.geo.ui.LegendModel({
      type: this.type,
      title: this.options.title,
      show_title: this.options.title ? true : false
    });

    this._bindModel();

  },

  render: function() {

    this.$el.html(this.template(this.model.toJSON()));

    this._renderItems();

    return this;

  }

});

/*
 * ColorLegend
 *
 * */
cdb.geo.ui.ColorLegend = cdb.geo.ui.BaseLegend.extend({

  className: "color-legend",

  type: "color",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul></ul>'),

  initialize: function() {

    this.items = this.model.items;

  },

  _renderItems: function() {

    this.items.each(this._renderItem, this);

  },

  _renderItem: function(item) {

    view = new cdb.geo.ui.LegendItem({
      model: item,
      className: (item.get("value") && item.get("value").indexOf("http") >= 0) ? "bkg" : "",
      template: '\t\t<div class="bullet" style="background: <%= value %>"></div> <%- name || ((name === false) ? "false": "null") %>'
    });

    this.$el.find("ul").append(view.render());

  },

  render: function() {

    this.$el.html(this.template(this.model.toJSON()));

    if (this.items.length > 0) {
      this._renderItems();
    } else {
      this.$el.html('<div class="warning">The color legend is empty</div>');
    }

    return this;

  }

});

/*
 * Color Legend public interface
 *
 * */
cdb.geo.ui.Legend.Color = cdb.geo.ui.Legend.Category.extend({ });

/*
 * StackedLegend
 *
 * */
cdb.geo.ui.StackedLegend = cdb.core.View.extend({

  events: {
    "dragstart":            "_stopPropagation",
    "mousedown":            "_stopPropagation",
    "touchstart":           "_stopPropagation",
    "MSPointerDown":        "_stopPropagation",
    "dblclick":             "_stopPropagation",
    "mousewheel":           "_stopPropagation",
    "DOMMouseScroll":       "_stopPropagation",
    "dbclick":              "_stopPropagation",
    "click":                "_stopPropagation"
  },

  className: "cartodb-legend-stack",

  initialize: function() {
    _.each(this.options.legends, this._setupBinding, this);
  },

  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  getLegendByIndex: function(index) {
    if (!this._layerByIndex) {
      this._layerByIndex = {};
      var legends = this.options.legends;
      for (var i = 0; i < legends.length; ++i) {
        var legend = legends[i];
        this._layerByIndex[legend.options.index] = legend;
      }
    }
    return this._layerByIndex[index];
  },

  _setupBinding: function(legend) {
    legend.model.bind("change:type", this._checkVisibility, this);
    this.add_related_model(legend.model);
  },

  render: function() {
    this._renderItems();
    this._checkVisibility();

    return this;
  },

  _renderItems: function() {
    _.each(this.options.legends, function(item) {
      this.$el.append(item.render().$el);
    }, this);
  },

  _checkVisibility: function() {
    var visible = _.some(this.options.legends, function(legend) {
      return legend.model.get("type") && (legend.model.get("type") != "none"  || legend.model.get("template"))
    }, this);

    if (visible) {
      this.show();
    } else {
      this.hide();
    }

    _.each(this.options.legends, function(item) {
      var legendModel = item.model;
      if (legendModel.get("type") === "none" || legendModel.get("visible") === false) {
        item.hide();
      } else {
        item.show();
      }
    }, this);
  },

  show: function() {
    this.$el.show();
  },

  hide: function() {
    this.$el.hide();
  },

  addTo: function(element) {
    $(element).html(this.render().$el);
  }
});


/*
 * Stacked Legend public interface
 *
 * */
cdb.geo.ui.Legend.Stacked = cdb.geo.ui.StackedLegend.extend({

  initialize: function() {

    if (this.options.legends) {

      var legendModels = _.map(this.options.legends, function(legend) {
        return legend.model;
      });

      this.legendItems = new cdb.geo.ui.Legends(legendModels);

      this.legendItems.bind("add remove change", this.render, this);

    } else if (this.options.data) {

      var legendModels = _.map(this.options.data, function(legend) {
        return new cdb.geo.ui.LegendModel(legend);
      });

      this.legendItems = new cdb.geo.ui.Legends(legendModels);

      this.legendItems.bind("add remove change", this.render, this);

    }

  },

  _capitalize: function(string) {
    if (string && _.isString(string)) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    }
  },

  render: function() {

    this.$el.empty();

    this.legends = [];

    if (this.legendItems && this.legendItems.length > 0) {

      this.legendItems.each(this._renderLegend, this);

    }

    return this;

  },

  _renderLegend: function(model) {

    var type = model.get("type");

    if (!type) type = "custom";

    type = this._capitalize(type);

    var view = new cdb.geo.ui.Legend[type](model.attributes);

    this.legends.push(view);

    if (model.get("visible") !== false) this.$el.append(view.render().$el);

  },

  getLegendAt: function(n) {

    return this.legends[n];

  },

  addLegend: function(attributes) {

    var legend = new cdb.geo.ui.LegendModel(attributes);
    this.legendItems.push(legend);

  },

  removeLegendAt: function(n) {

    var legend = this.legendItems.at(n);
    this.legendItems.remove(legend);

  }

});

/*
 * CustomLegend
 *
 * */
cdb.geo.ui.CustomLegend = cdb.geo.ui.BaseLegend.extend({

  className: "custom-legend",
  type: "custom",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul></ul>'),

  initialize: function() {
    this.items = this.model.items;
  },

  setData: function(data) {

    this.items = new cdb.geo.ui.LegendItems(data);
    this.model.items = this.items;
    this.model.set("items", data);

  },

  _renderItems: function() {

    this.items.each(this._renderItem, this);

  },

  _renderItem: function(item) {

    var template = this.options.itemTemplate || '\t\t<div class="bullet" style="background:<%= value %>"></div>\n\t\t<%- name || "null" %>';

    view = new cdb.geo.ui.LegendItem({
      model: item,
      className: (item.get("value") && item.get("value").indexOf("http") >= 0) ? "bkg" : "",
      template: template
    });

    this.$el.find("ul").append(view.render());

  },

  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

    } else {

      this.$el.html(this.template(this.model.toJSON()));

      if (this.items.length > 0) {
        this._renderItems();
      } else {
        this.$el.html('<div class="warning">The legend is empty</div>');
      }
    }

    return this;

  }

});

/*
 * Custom Legend public interface
 *
 * */
cdb.geo.ui.Legend.Custom = cdb.geo.ui.CustomLegend.extend({

  className: "cartodb-legend custom",

  type: "custom",

  initialize: function() {

    this.items = new cdb.geo.ui.LegendItems(this.options.data || this.options.items);

    this.model = new cdb.geo.ui.LegendModel({
      type: this.type,
      title: this.options.title,
      show_title: this.options.title ? true : false,
      items: this.items.models
    });

    this._bindModel();

  },

  _bindModel: function() {

    this.model.bind("change:items change:template change:title change:show_title", this.render, this);

  }

});

/*
 * BubbleLegend
 *
 * */
cdb.geo.ui.BubbleLegend = cdb.geo.ui.BaseLegend.extend({

  className: "bubble-legend",

  template: _.template('<% if (title && show_title) { %>\n<div class="legend-title"><%- title %></div><% } %><ul><li>\t<%- min %></li><li class="graph">\t\t<div class="bubbles"></div></li><li>\t<%- max %></li></ul>'),

  initialize: function() {

    this.items = this.model.items;

  },

  _bindModel: function() {

    this.model.bind("change:template change:title change:show_title change:color change:min change:max", this.render, this);

  },

  setColor: function(color) {
    this.model.set("color", color);
  },

  setMinValue: function(value) {
    this.model.set("min", value);
  },

  setMaxValue: function(value) {
    this.model.set("max", value);
  },

  _renderGraph: function(color) {
    this.$el.find(".graph").css("background", color);
  },

  render: function() {

    if (this.model.get("template")) {

      var template = _.template(cdb.core.sanitize.html(this.model.get("template"), this.model.get('sanitizeTemplate')));
      this.$el.html(template(this.model.toJSON()));

      this.$el.removeClass("bubble-legend");

    } else {

      var color = this.model.get("color") || (this.items.length >= 3 ? this.items.at(2).get("value") : "");

      if (this.items.length >= 3) {

        var min = this.model.get("min") || this.items.at(0).get("value");
        var max = this.model.get("max") || this.items.at(1).get("value");

        var options = _.extend(this.model.toJSON(), { min: min, max: max });

        this.$el.html(this.template(options));

      }

      this._renderGraph(color);
    }

    return this;

  }

});


/*
 * Bubble Legend public interface
 *
 * */
cdb.geo.ui.Legend.Bubble = cdb.geo.ui.BubbleLegend.extend({

  className: "cartodb-legend bubble",

  type: "bubble",

  initialize: function() {

    this.model = new cdb.geo.ui.LegendModel({
      type:  this.type,
      title: this.options.title,
      min:   this.options.min,
      max:   this.options.max,
      color: this.options.color,
      show_title: this.options.title ? true : false
    });

    this.add_related_model(this.model);

    this._bindModel();

  },

  render: function() {

    this.$el.html(this.template(this.model.toJSON()));

    this._renderGraph(this.model.get("color"));

    return this;

  }

});

/*
 * Choropleth Legend public interface
 *
 * */
cdb.geo.ui.Legend.Choropleth = cdb.geo.ui.ChoroplethLegend.extend({

  type: "choropleth",

  className: "cartodb-legend choropleth",

  initialize: function() {

    this.items    = this.options.items;

    this.model = new cdb.geo.ui.LegendModel({
      type:          this.type,
      title:         this.options.title,
      show_title:    this.options.title ? true : false,
      leftLabel:     this.options.left  || this.options.leftLabel,
      rightLabel:    this.options.right || this.options.rightLabel,
      colors:        this.options.colors,
      buckets_count: this.options.colors ? this.options.colors.length : 0
    });

    this.add_related_model(this.model);
    this._bindModel();

  },

  _bindModel: function() {

    this.model.bind("change:template change:title change:show_title change:colors change:leftLabel change:rightLabel", this.render, this);

  },

  _generateColorList: function() {

    return _.map(this.model.get("colors"), function(color) {
      return '\t\t<div class="quartile" style="background-color:' + color + '"></div>';
    }).join("");

  },

  render: function() {

    var options = _.extend(this.model.toJSON(), { colors: this._generateColorList() });

    this.$el.html(this.template(options));

    return this;

  }

});


/*
 * Intensity Legend public interface
 *
 * */
cdb.geo.ui.Legend.Intensity = cdb.geo.ui.IntensityLegend.extend({

  className: "cartodb-legend intensity",
  type: "intensity",

  initialize: function() {

    this.items = this.options.items;

    this.model = new cdb.geo.ui.LegendModel({
      type: this.type,
      title: this.options.title,
      show_title: this.options.title ? true : false,
      color: this.options.color,
      leftLabel: this.options.left || this.options.leftLabel,
      rightLabel: this.options.right || this.options.rightLabel
    });

    this.add_related_model(this.model);
    this._bindModel();

  },

  _bindModel: function() {

    this.model.bind("change:title change:show_title change:color change:leftLabel change:rightLabel", this.render, this);

  },

  render: function() {

    this.$el.html(this.template(this.model.toJSON()));

    this._renderGraph(this.model.get("color"));

    return this;

  }

});

},{}],45:[function(require,module,exports){
cdb.geo.ui.MobileLayer = cdb.core.View.extend({

  events: {
    'click h3':    "_toggle",
    "dblclick":  "_stopPropagation"
  },

  tagName: "li",

  className: "cartodb-mobile-layer has-toggle",

  template: cdb.core.Template.compile("<% if (show_title) { %><h3><%- layer_name %><% } %><a href='#' class='toggle<%- toggle_class %>'></a></h3>"),

  /**
   *  Stop event propagation
   */
  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  initialize: function() {

    _.defaults(this.options, this.default_options);

    this.model.bind("change:visible", this._onChangeVisible, this);

  },

  _onChangeVisible: function() {

    this.$el.find(".legend")[ this.model.get("visible") ? "fadeIn":"fadeOut"](150);
    this.$el[ this.model.get("visible") ? "removeClass":"addClass"]("hidden");

    this.trigger("change_visibility", this);

  },

  _toggle: function(e) {

    e.preventDefault();
    e.stopPropagation();

    if (this.options.hide_toggle) return;

    this.model.set("visible", !this.model.get("visible"))

  },

  _renderLegend: function() {

    if (!this.options.show_legends) return;

    if (this.model.get("legend") && (this.model.get("legend").type == "none" || !this.model.get("legend").type)) return;
    if (this.model.get("legend") && this.model.get("legend").items && this.model.get("legend").items.length == 0) return;

    this.$el.addClass("has-legend");

    var legend = new cdb.geo.ui.Legend(this.model.get("legend"));

    legend.undelegateEvents();

    this.$el.append(legend.render().$el);

  },

  _truncate: function(input, length) {
    return input.substr(0, length-1) + (input.length > length ? '&hellip;' : '');
  },

  render: function() {

    var layer_name = this.model.get("layer_name");

    layer_name = layer_name ? this._truncate(layer_name, 23) : "untitled";

    var attributes = _.extend(
      this.model.attributes,
      {
        layer_name:   this.options.show_title ? layer_name : "",
        toggle_class: this.options.hide_toggle ? " hide" : ""
      }
    );

    this.$el.html(this.template(_.extend(attributes, { show_title: this.options.show_title } )));


    if (this.options.hide_toggle)   this.$el.removeClass("has-toggle");
    if (!this.model.get("visible")) this.$el.addClass("hidden");
    if (this.model.get("legend"))   this._renderLegend();

    this._onChangeVisible();

    return this;
  }

});

cdb.geo.ui.Mobile = cdb.core.View.extend({

  className: "cartodb-mobile",

  events: {
    "click .cartodb-attribution-button": "_onAttributionClick",
    "click .toggle":                     "_toggle",
    "click .fullscreen":                 "_toggleFullScreen",
    "click .backdrop":                   "_onBackdropClick",
    "dblclick .aside":                   "_stopPropagation",
    "dragstart .aside":                  "_checkOrigin",
    "mousedown .aside":                  "_checkOrigin",
    "touchstart .aside":                 "_checkOrigin",
    "MSPointerDown .aside":              "_checkOrigin",
  },

  initialize: function() {

    _.bindAll(this, "_toggle", "_reInitScrollpane");

    _.defaults(this.options, this.default_options);

    this.hasLayerSelector = false;
    this.layersLoading    = 0;

    this.slides_data   = this.options.slides_data;
    this.visualization = this.options.visualization;

    if (this.visualization) {
      this.slides      = this.visualization.slides;
    }

    this.mobileEnabled = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    this.visibility_options = this.options.visibility_options || {};

    this.mapView  = this.options.mapView;
    this.map      = this.mapView.map;

    this.template = this.options.template ? this.options.template : cdb.templates.getTemplate('geo/zoom');

    this._selectOverlays();

    this._setupModel();

    window.addEventListener('orientationchange', _.bind(this.doOnOrientationChange, this));

    this._addWheelEvent();

  },

  loadingTiles: function() {
    if (this.loader) {
      this.loader.show()
    }

    if (this.layersLoading === 0) {
      this.trigger('loading');
    }
    this.layersLoading++;
  },

  loadTiles: function() {
    if (this.loader) {
      this.loader.hide();
    }
    this.layersLoading--;
    // check less than 0 because loading event sometimes is
    // thrown before visualization creation
    if(this.layersLoading <= 0) {
      this.layersLoading = 0;
      this.trigger('load');
    }
  },

  _selectOverlays: function() {

    if (this.slides && this.slides_data) { // if there are slides…

      var state = this.slides.state();

      if (state == 0) this.overlays = this.options.overlays; // first slide == master vis
      else {
        this.overlays = this.slides_data[state - 1].overlays;
      }
    } else { // otherwise we load the regular overlays
      this.overlays = this.options.overlays;
    }

  },

  _addWheelEvent: function() {

      var self    = this;
      var mapView = this.options.mapView;

      $(document).on('webkitfullscreenchange mozfullscreenchange fullscreenchange', function() {

        if ( !document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
          mapView.options.map.set("scrollwheel", false);
        }

        mapView.invalidateSize();

      });

  },

  _setupModel: function() {

    this.model = new Backbone.Model({
      open: false,
      layer_count: 0
    });

    this.model.on("change:open", this._onChangeOpen, this);
    this.model.on("change:layer_count", this._onChangeLayerCount, this);

  },

  /**
   *  Check event origin
   */
  _checkOrigin: function(ev) {
    // If the mouse down come from jspVerticalBar
    // dont stop the propagation, but if the event
    // is a touchstart, stop the propagation
    var come_from_scroll = (($(ev.target).closest(".jspVerticalBar").length > 0) && (ev.type != "touchstart"));

    if (!come_from_scroll) {
      ev.stopPropagation();
    }
  },

  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  _onBackdropClick: function(e) {

    e.preventDefault();
    e.stopPropagation();

    this.$el.find(".backdrop").fadeOut(250);
    this.$el.find(".cartodb-attribution").fadeOut(250);

  },

  _onAttributionClick: function(e) {

    e.preventDefault();
    e.stopPropagation();

    this.$el.find(".backdrop").fadeIn(250);
    this.$el.find(".cartodb-attribution").fadeIn(250);

  },

  _toggle: function(e) {

    e.preventDefault();
    e.stopPropagation();

    this.model.set("open", !this.model.get("open"));

  },

  _toggleFullScreen: function(ev) {

    ev.stopPropagation();
    ev.preventDefault();

    var doc   = window.document;
    var docEl = $("#map > div")[0];

    var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen;
    var cancelFullScreen  = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen;

    var mapView = this.options.mapView;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement) {

      requestFullScreen.call(docEl);

      if (mapView) {

        mapView.options.map.set("scrollwheel", true);

      }

    } else {

      cancelFullScreen.call(doc);

    }
  },

  _open: function() {

    var right = this.$el.find(".aside").width();

    this.$el.find(".cartodb-header").animate({ right: right }, 200)
    this.$el.find(".aside").animate({ right: 0 }, 200)
    this.$el.find(".cartodb-attribution-button").animate({ right: right + parseInt(this.$el.find(".cartodb-attribution-button").css("right")) }, 200)
    this.$el.find(".cartodb-attribution").animate({ right: right + parseInt(this.$el.find(".cartodb-attribution-button").css("right")) }, 200)
    this._initScrollPane();

  },

  _close: function() {

    this.$el.find(".cartodb-header").animate({ right: 0 }, 200)
    this.$el.find(".aside").animate({ right: - this.$el.find(".aside").width() }, 200)
    this.$el.find(".cartodb-attribution-button").animate({ right: 20 }, 200)
    this.$el.find(".cartodb-attribution").animate({ right: 20 }, 200)

  },

  default_options: {
    timeout: 0,
    msg: ''
  },

  _stopPropagation: function(ev) {
    ev.stopPropagation();
  },

  doOnOrientationChange: function() {

    switch(window.orientation)
    {
      case -90:
      case 90: this.recalc("landscape");
        break;
      default: this.recalc("portrait");
        break;
    }
  },

  recalc: function(orientation) {

    var height = $(".legends > div.cartodb-legend-stack").height();

    if (this.$el.hasClass("open") && height < 100 && !this.$el.hasClass("torque")) {

      this.$el.css("height", height);
      this.$el.find(".top-shadow").hide();
      this.$el.find(".bottom-shadow").hide();

    } else if (this.$el.hasClass("open") && height < 100 && this.$el.hasClass("legends") && this.$el.hasClass("torque")) {

      this.$el.css("height", height + $(".legends > div.torque").height() );
      this.$el.find(".top-shadow").hide();
      this.$el.find(".bottom-shadow").hide();

    }

  },

  _onChangeLayerCount: function() {

    var layer_count = this.model.get("layer_count");
    var msg = layer_count + " layer" + (layer_count != 1 ? "s" : "");
    this.$el.find(".aside .layer-container > h3").html(msg);

  },

  _onChangeOpen: function() {
    this.model.get("open") ? this._open() : this._close();
  },

  _createLayer: function(_class, opts) {
    return new cdb.geo.ui[_class](opts);
  },

  _getLayers: function() {

    this.layers = [];

    // we add the layers to the array depending on the method used
    // to sent us the layers
    if (this.options.layerView) {
      this._getLayersFromLayerView();
    } else {
      _.each(this.map.layers.models, this._getLayer, this);
    }

  },

  _getLayersFromLayerView: function() {

    if (this.options.layerView && this.options.layerView.model.get("type") == "layergroup") {

      this.layers = _.map(this.options.layerView.layers, function(l, i) {

        var m = new cdb.core.Model(l);

        m.set('order', i);
        m.set('type', 'layergroup');
        m.set('visible', l.visible);
        m.set('layer_name', l.options.layer_name);

        layerView = this._createLayer('LayerViewFromLayerGroup', {
          model: m,
          layerView: this.options.layerView,
          layerIndex: i
        });

        return layerView.model;

      }, this);

    } else if (this.options.layerView && (this.options.layerView.model.get("type") == "torque")) {

      var layerView = this._createLayer('LayerView', { model: this.options.layerView.model });

      this.layers.push(layerView.model);

    }
  },

  _getLayer: function(layer) {

    if (layer.get("type") == 'layergroup' || layer.get('type') === 'namedmap') {

      var layerGroupView = this.mapView.getLayerByCid(layer.cid);

      for (var i = 0 ; i < layerGroupView.getLayerCount(); ++i) {

        var l = layerGroupView.getLayer(i);
        var m = new cdb.core.Model(l);

        m.set('order', i);
        m.set('type', 'layergroup');
        m.set('visible', l.visible);
        m.set('layer_name', l.options.layer_name);

        layerView = this._createLayer('LayerViewFromLayerGroup', {
          model: m,
          layerView: layerGroupView,
          layerIndex: i
        });

        this.layers.push(layerView.model);

      }

    } else if (layer.get("type") === "CartoDB" || layer.get('type') === 'torque') {

      if (layer.get('type') === 'torque')  {
        layer.on("change:visible", this._toggleSlider, this);
      }

      this.layers.push(layer);

    }

  },

  _toggleSlider: function(m) {

    if (m.get("visible")) {
      this.$el.addClass("with-torque");
      this.slider.show();
    } else {
      this.$el.removeClass("with-torque");
      this.slider.hide();
    }

  },

  _reInitScrollpane: function() {
    this.$('.scrollpane').data('jsp') && this.$('.scrollpane').data('jsp').reinitialise();
  },

  _bindOrientationChange: function() {

    var self = this;

    var onOrientationChange = function() {
      $(".cartodb-mobile .scrollpane").css("max-height", self.$el.height() - 30);
      $('.cartodb-mobile .scrollpane').data('jsp') && $('.cartodb-mobile .scrollpane').data('jsp').reinitialise();
    };

    if (!window.addEventListener) {
      window.attachEvent('orientationchange', onOrientationChange, this);
    } else {
      window.addEventListener('orientationchange', _.bind(onOrientationChange));
    }

  },

  _renderOverlays: function() {

    var hasSearchOverlay  = false;
    var hasZoomOverlay    = false;
    var hasLoaderOverlay  = false;
    var hasLayerSelector  = false;

    _.each(this.overlays, function(overlay) {

      if (!this.visibility_options.search && overlay.type == 'search') {
        if (this.visibility_options.search !== false && this.visibility_options.search !== "false") {
          this._addSearch();
          hasSearchOverlay = true;
        }
      }

      if (!this.visibility_options.zoomControl && overlay.type === 'zoom') {
        if (this.visibility_options.zoomControl !== "false") {
          this._addZoom();
          hasZoomOverlay = true;
        }
      }

      if (!this.visibility_options.loaderControl && overlay.type === 'loader') {
        if (this.visibility_options.loaderControl !== "false") {
          this._addLoader();
          hasLoaderOverlay = true;
        }
      }

      if (overlay.type == 'fullscreen' && !this.mobileEnabled) {
        this._addFullscreen();
      }

      if (overlay.type == 'header') {
        this._addHeader(overlay);
      }

      if (overlay.type == 'layer_selector') {
        hasLayerSelector = true;
      }

    }, this);

    var search_visibility = this.visibility_options.search === true        || this.visibility_options.search === "true";
    var zoom_visibility   = this.visibility_options.zoomControl === true   || this.visibility_options.zoomControl === "true";
    var loader_visibility = this.visibility_options.loaderControl === true || this.visibility_options.loaderControl === "true";
    var layer_selector_visibility  = this.visibility_options.layer_selector;

    if (!hasSearchOverlay  && search_visibility) this._addSearch();
    if (!hasZoomOverlay    && zoom_visibility)   this._addZoom();
    if (!hasLoaderOverlay  && loader_visibility) this._addLoader();
    if (layer_selector_visibility || hasLayerSelector && layer_selector_visibility == undefined) this.hasLayerSelector = true;

  },

  _initScrollPane: function() {

    if (this.$scrollpane) return;

    var self = this;

    var height       = this.$el.height();
    this.$scrollpane = this.$el.find(".scrollpane");

    setTimeout(function() {
      self.$scrollpane.css("max-height", height - 60);
      self.$scrollpane.jScrollPane({ showArrows: true });
    }, 500);

  },

  _addZoom: function() {

    var template = cdb.core.Template.compile('\
    <a href="#zoom_in" class="zoom_in">+</a>\
    <a href="#zoom_out" class="zoom_out">-</a>\
    <div class="info"></div>', 'mustache'
    );

    var zoom = new cdb.geo.ui.Zoom({
      model: this.options.map,
      template: template
    });

    this.$el.append(zoom.render().$el);
    this.$el.addClass("with-zoom");

  },

  _addLoader: function() {

    var template = cdb.core.Template.compile('<div class="loader"></div>', 'mustache');

    this.loader = new cdb.geo.ui.TilesLoader({
      template: template
    });

    this.$el.append(this.loader.render().$el);
    this.$el.addClass("with-loader");

  },

  _addFullscreen: function() {

    if (this.visibility_options.fullscreen != false) {
      this.hasFullscreen = true;
      this.$el.addClass("with-fullscreen");
    }

  },

  _addSearch: function() {

    this.hasSearch = true;

    var template = cdb.core.Template.compile('\
      <form>\
      <span class="loader"></span>\
      <input type="text" class="text" placeholder="Search for places..." value="" />\
      <input type="submit" class="submit" value="" />\
      </form>\
      ', 'mustache'
    );

    var search = new cdb.geo.ui.Search({
      template: template,
      mapView: this.mapView,
      model: this.mapView.map
    });

    this.$el.find(".aside").prepend(search.render().$el);
    this.$el.find(".cartodb-searchbox").show();
    this.$el.addClass("with-search");

  },

  _addHeader: function(overlay) {

    this.hasHeader = true;

    this.$header = this.$el.find(".cartodb-header");

    var title_template = _.template('<div class="hgroup"><% if (show_title) { %><div class="title"><%= title %></div><% } %><% if (show_description) { %><div class="description"><%= description %><% } %></div></div>');

    var extra = overlay.options.extra;
    var has_header = false;
    var show_title = false, show_description = false;

    if (extra) {

      if (this.visibility_options.title || this.visibility_options.title != false && extra.show_title)      {
        has_header = true;
        show_title = true;
      }

      if (this.visibility_options.description || this.visibility_options.description != false && extra.show_description) {
        has_header = true;
        show_description = true;
      }

      if (this.slides) {
        has_header = true;
      }

      var $hgroup = title_template({
        title: cdb.core.sanitize.html(extra.title),
        show_title:show_title,
        description: cdb.core.sanitize.html(extra.description),
        show_description: show_description
      });

      if (has_header) {
        this.$el.addClass("with-header");
        this.$header.find(".content").append($hgroup);
      }

    }

  },

  _addAttributions: function() {

    var attributions = "";

    this.options.mapView.$el.find(".leaflet-control-attribution").hide(); // TODO: remove this from here

    if (this.options.layerView) {

      attributions = this.options.layerView.model.get("attribution");
      this.$el.find(".cartodb-attribution").append(attributions);

    } else if (this.options.map.get("attribution")) {

      attributions = this.options.map.get("attribution");

      _.each(attributions, function(attribution) {
        var $li = $("<li></li>");
        var $el = $li.html(attribution);
        this.$el.find(".cartodb-attribution").append($li);
      }, this);

    }

    if (attributions) {
      this.$el.find(".cartodb-attribution-button").fadeIn(250);
    }

  },

  _renderLayers: function() {

    var hasLegendOverlay = this.visibility_options.legends;

    var legends = this.layers.filter(function(layer) {
      return layer.get("legend") && layer.get("legend").type !== "none"
    });

    var hasLegends = legends.length ? true : false;

    if (!this.hasLayerSelector && !hasLegendOverlay) return;
    if (!this.hasLayerSelector && !hasLegends) return;
    if (this.layers.length == 0) return;
    if (this.layers.length == 1 && !hasLegends) return;

    this.$el.addClass("with-layers");

    this.model.set("layer_count", 0);

    if (!this.hasSearch) this.$el.find(".aside .layer-container").prepend("<h3></h3>");

    _.each(this.layers, this._renderLayer, this);

  },

  _renderLayer: function(data) {

    var hasLegend = data.get("legend") && data.get("legend").type !== "" && data.get("legend").type !== "none";

    // When the layer selector is disabled, don't show the layer if it doesn't have legends
    if (!this.hasLayerSelector && !hasLegend) return;
    if (!this.hasLayerSelector && !data.get("visible")) return;

    var hide_toggle = (this.layers.length == 1 || !this.hasLayerSelector);

    var show_legends = true;

    if (this.visibility_options && this.visibility_options.legends !== undefined) {
      show_legends = this.visibility_options.legends;
    }

    var layer = new cdb.geo.ui.MobileLayer({
      model: data,
      show_legends: show_legends,
      show_title: !this.hasLayerSelector ? false : true,
      hide_toggle: hide_toggle
    });

    this.$el.find(".aside .layers").append(layer.render().$el);

    layer.bind("change_visibility", this._reInitScrollpane, this);

    this.model.set("layer_count", this.model.get("layer_count") + 1);

  },

  _renderTorque: function() {

    if (this.options.torqueLayer) {

      this.hasTorque = true;

      this.slider = new cdb.geo.ui.TimeSlider({type: "time_slider", layer: this.options.torqueLayer, map: this.options.map, pos_margin: 0, position: "none" , width: "auto" });

      this.slider.bind("time_clicked", function() {
        this.slider.toggleTime();
      }, this);

      this.$el.find(".torque").append(this.slider.render().$el);

      if (this.options.torqueLayer.hidden) this.slider.hide();
      else this.$el.addClass("with-torque");
    }

  },

  _renderSlidesController: function() {

    if (this.slides) {

      this.$el.addClass("with-slides");

      this.slidesController = new cdb.geo.ui.SlidesController({
        show_counter: true,
        transitions: this.options.transitions,
        visualization: this.options.visualization,
        slides: this.slides
      });

      this.$el.append(this.slidesController.render().$el);

    }

  },

  render: function() {

    this._bindOrientationChange();

    this.$el.html(this.template(this.options));

    this.$header = this.$el.find(".cartodb-header");
    this.$header.show();

    this._renderOverlays();

    this._renderSlidesController();

    this._addAttributions();

    this._getLayers();
    this._renderLayers();
    this._renderTorque();

    return this;

  }

});

},{}],46:[function(require,module,exports){
/**
 *  UI component to place the map in the
 *  location found by the geocoder.
 *
 */

cdb.geo.ui.Search = cdb.core.View.extend({

  className: 'cartodb-searchbox',

  _ZOOM_BY_CATEGORY: {
    'building': 18,
    'postal-area': 15,
    'default': 12
  },

  events: {
    "click input[type='text']": '_onFocus',
    "submit form": '_onSubmit',
    "click": '_stopPropagation',
    "dblclick": '_stopPropagation',
    "mousedown": '_stopPropagation'
  },

  options: {
    searchPin: true,
    infowindowTemplate: '<div class="cartodb-infowindow">'+
    '<div class="cartodb-popup v2 centered">'+
      '<a href="#close" class="cartodb-popup-close-button close">x</a>'+
       '<div class="cartodb-popup-content-wrapper">'+
         '<p>{{ address }}</p>'+
       '</div>'+
       '<div class="cartodb-popup-tip-container"></div>'+
    '</div>',
    infowindowWidth: 186,
    infowindowOffset: [93, 90],
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAfCAYAAADXwvzvAAACuklEQVR4Ae3PQ+AsNxzA8e8vo/Xus237vVN9qW3b7qW2bdu2caxt29bu/meSmaTpqW63Pfc7wemTZPh9K/Xv3zhzxIgVrho0aMsLGo2N9o+iuYDwV02E5NJpM7d5fMGC515dMP/7l6dNMc+OGJY9Uq99cVMc33I4LOJXCQBQuXPBglNnDRm0Xa1RAWewP3yL/vJLul99Q/pNm0/b+qsnbLHngXAVgAI4b9KkXWc1m9vV58ykst56lKdMptyokdTKRJUIV1MMTGTgbOTknWABgFo2SSbOjuN9wlgIBrSIJ0yiVG9QUgGxUigRRAlpCQYrBs+A/QClliuXV6ppPVibDPPqi5irL8G+/QY2S3FZhityrLNYBWkAI2G5WTA2nGTthKDTJfP/FH1sCb76nNBa7I8/knba6Eyj8wJjLbk4qlCdAFNClWXKiiL72kGRUkSRhwUuTUm7XTqZ3z3KnMM7QhAFUfiKMZ9OQci+ydFFH32BIsDh8hxjDF2T0y0KtHHUczCg34P3wgesfWhZozstW1R/cJpuohA8dI7cWrSfxqM4gwEOnoJnn4HXBVDHwHnriNr2W3G0I8FEkKufMbjcIw1DC+iCuRw2OBduEYAKDD8drlkGlk6BHwAtIEDioD/QBnsnnHAI7A9YAAAGenwEnPuAd8+DewHcS+CeB3szvL0b7ADE/FWzYf5BCxa9dMvqa7oLll7WbTlsxKkDYRi9dPqhRz743L0PuKtOPMXtutHmm/InKf5Y6Co15Upl8qSCqVajXiEeUTRb6GqNIojoGaLEDwEA6B0KIKL8lH8JBeS/3AgK73qAPfc/tCLiAACUCmyvsJHnphwEAYFStNs/NoHgn2ATWPmlF54b/9GHH/Khn88/+9SywJx/+q0SsKTZbB45d/6CO0aNHnutv3kbYDQg9JAAIRDwF/0EjlkjUi3fkAMAAAAASUVORK5CYII=',
    iconAnchor: [7, 31]
  },

  initialize: function() {
    this.mapView = this.options.mapView;
    this.template = this.options.template;
  },

  render: function() {
    this.$el.html(this.template(this.options));
    return this;
  },

  _stopPropagation: function(ev) {
    if (ev) {
      ev.stopPropagation();
    }
  },

  _onFocus: function(ev) {
    if (ev) {
      ev.preventDefault();
      $(ev.target).focus();
    }
  },

  _showLoader: function() {
    this.$('span.loader').show();
  },

  _hideLoader: function() {
    this.$('span.loader').hide();
  },

  _onSubmit: function(ev) {
    ev.preventDefault();
    var self = this;
    var address = this.$('input.text').val();

    if (!address) {
      return;
    }

    // Show geocoder loader
    this._showLoader();
    // Remove previous pin
    this._destroySearchPin();
    cdb.geo.geocoder.NOKIA.geocode(address, function(places) {
      self._onResult(places);
      // Hide loader
      self._hideLoader();
    });
  },

  _onResult: function(places) {
    var position = '';
    var address = this.$('input.text').val();

    if (places && places.length>0) {
      var location = places[0];
      var validBBox = this._isBBoxValid(location);

      // Get BBox if possible and set bounds
      if (validBBox) {
        var s = parseFloat(location.boundingbox.south);
        var w = parseFloat(location.boundingbox.west);
        var n = parseFloat(location.boundingbox.north);
        var e = parseFloat(location.boundingbox.east);

        var centerLon = (w + e)/2;
        var centerLat = (s + n)/2;
        position = [centerLat, centerLon];
        this.model.setBounds([ [ s, w ], [ n, e ] ]);
      }

      // If location is defined,
      // let's store it
      if (location.lat && location.lon) {
        position = [location.lat, location.lon];
      }

      // In the case that BBox is not valid, let's
      // center the map using the position
      if (!validBBox) {
        this.model.setCenter(position);
        this.model.setZoom(this._getZoomByCategory(location.type));
      }

      if (this.options.searchPin) {
        this._createSearchPin(position, address);
      }
    }
  },

  // Getting zoom for each type of location
  _getZoomByCategory: function(type) {
    if (type && this._ZOOM_BY_CATEGORY[type]) {
      return this._ZOOM_BY_CATEGORY[type];
    }
    return this._ZOOM_BY_CATEGORY['default'];
  },

  _isBBoxValid: function(location) {
    if(!location.boundingbox || location.boundingbox.south == location.boundingbox.north ||
      location.boundingbox.east == location.boundingbox.west) {
      return false;
    }
    return true;
  },

  _createSearchPin: function(position, address) {
    this._destroySearchPin();
    this._createPin(position, address);
    this._createInfowindow(position, address);
    this._bindEvents();
  },

  _destroySearchPin: function() {
    this._unbindEvents();
    this._destroyPin();
    this._destroyInfowindow()
  },

  _createInfowindow: function(position, address) {
    var infowindowModel = new cdb.geo.ui.InfowindowModel({
      template: this.options.infowindowTemplate,
      latlng: position,
      width: this.options.infowindowWidth,
      offset: this.options.infowindowOffset,
      content: {
        fields: [{
          title: 'address',
          value: address
        }]
      }
    });

    this._searchInfowindow = new cdb.geo.ui.Infowindow({
      model: infowindowModel,
      mapView: this.mapView
    });

    this.mapView.$el.append(this._searchInfowindow.el);
    infowindowModel.set('visibility', true);
  },

  _destroyInfowindow: function() {
    if (this._searchInfowindow) {
      // Hide it and then destroy it (when animation ends)
      this._searchInfowindow.hide(true);
      var infowindow = this._searchInfowindow;
      setTimeout(function() {
        infowindow.clean();
      }, 1000);
    }
  },

  _createPin: function(position, address) {
    this._searchPin = this.mapView._addGeomToMap(
      new cdb.geo.Geometry({
        geojson: { type: "Point", "coordinates": [ position[1], position[0] ] },
        iconUrl: this.options.iconUrl,
        iconAnchor: this.options.iconAnchor
      })
    );
  },

  _toggleSearchInfowindow: function() {
    var infowindowVisibility = this._searchInfowindow.model.get('visibility');
    this._searchInfowindow.model.set('visibility', !infowindowVisibility);
  },

  _destroyPin: function() {
    if (this._searchPin) {
      this.mapView._removeGeomFromMap(this._searchPin);
      delete this._searchPin;
    }
  },

  _bindEvents: function() {
    this._searchPin && this._searchPin.bind('click', this._toggleSearchInfowindow, this);
    this.mapView.bind('click', this._destroySearchPin, this);
  },

  _unbindEvents: function() {
    this._searchPin && this._searchPin.unbind('click', this._toggleSearchInfowindow, this);
    this.mapView.unbind('click', this._destroySearchPin, this);
  },

  clean: function() {
    this._unbindEvents();
    this._destroySearchPin();
    this.elder('clean');
  }

});

},{}],47:[function(require,module,exports){
cdb.geo.ui.Share = cdb.core.View.extend({

  className: "cartodb-share",

  events: {
    "click a": "_onClick"
  },
  default_options: { },

  initialize: function() {

    _.bindAll(this, "_onClick");

    _.defaults(this.options, this.default_options);

    this.template = this.options.template;

  },

  _applyStyle: function() { },

  _onClick: function(e) {

    e.preventDefault();
    e.stopPropagation();

    this.dialog.show();

  },

  createDialog: function() {

    var data = this.options;
    data.template = "";

    // Add the complete url for facebook and twitter
    if (location.href) {
      data.share_url = encodeURIComponent(location.href);
    } else {
      data.share_url = data.url;
    }

    var template = cdb.core.Template.compile(
      data.template || '\
      <div class="mamufas">\
      <div class="block modal {{modal_type}}">\
      <a href="#close" class="close">x</a>\
      <div class="head">\
      <h3>Share this map</h3>\
      </div>\
      <div class="content">\
      <div class="buttons">\
      <h4>Social</h4>\
      <ul>\
      <li><a class="facebook" target="_blank" href="{{ facebook_url }}">Share on Facebook</a></li>\
      <li><a class="twitter" href="{{ twitter_url }}" target="_blank">Share on Twitter</a></li>\
      <li><a class="link" href="{{ public_map_url }}" target="_blank">Link to this map</a></li>\
      </ul>\
      </div><div class="embed_code">\
      <h4>Embed this map</h4>\
      <textarea id="" name="" cols="30" rows="10">{{ code }}</textarea>\
      </div>\
      </div>\
      </div>\
      </div>\
      ',
      data.templateType || 'mustache'
    );

    var url = location.href;

    url = url.replace("public_map", "embed_map");

    var public_map_url = url.replace("embed_map", "public_map"); // TODO: get real URL

    var code = "<iframe width='100%' height='520' frameborder='0' src='" + url + "' allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe>";

    this.dialog = new cdb.ui.common.ShareDialog({
      title: data.map.get("title"),
      description: data.map.get("description"),
      model: this.options.vis.map,
      code: code,
      url: data.url,
      public_map_url: public_map_url,
      share_url: data.share_url,
      template: template,
      target: $(".cartodb-share a"),
      size: $(document).width() > 400 ? "" : "small",
      width: $(document).width() > 400 ? 430 : 216
    });

    $(".cartodb-map-wrapper").append(this.dialog.render().$el);

    this.addView(this.dialog);

  },

  render: function() {

    this.$el.html(this.template(_.extend(this.model.attributes)));

    return this;

  }

});

},{}],48:[function(require,module,exports){
cdb.geo.ui.SlidesControllerItem = cdb.core.View.extend({

  tagName: "li",

  events: {
    "click a": "_onClick",
  },

  template: cdb.core.Template.compile('<a href="#" class="<%- transition_trigger %>"></a>'),

  initialize: function() {

    this.model = new cdb.core.Model(this.options);
    this.model.bind("change:active", this._onChangeActive, this);

  },

  _onChangeActive: function(e) {

    if (this.model.get("active")) {
      this.$el.find("a").addClass("active");
    } else {
      this.$el.find("a").removeClass("active");
    }

  },

  _onClick: function(e) {
    if (e) this.killEvent(e);
    this.trigger("onClick", this)
  },

  render: function() {

    var options = _.extend({ transition_trigger: "click" }, this.options.transition_options);

    this.$el.html(this.template(options));

    this._onChangeActive();

    return this;
  }

});

cdb.geo.ui.SlidesController = cdb.core.View.extend({

  defaults: {
    show_counter: false
  },

  events: {
    'click a.next': "_next",
    'click a.prev': "_prev"
  },

  tagName: "div",

  className: "cartodb-slides-controller",

  template: cdb.core.Template.compile("<div class='slides-controller-content'><a href='#' class='prev'></a><% if (show_counter) {%><div class='counter'></div><% } else { %><ul></ul><% } %><a href='#' class='next'></a></div>"),

  initialize: function() {
    this.slidesCount = this.options.transitions.length;
    this.visualization = this.options.visualization;
    this.slides = this.visualization.slides;
  },

  _prev: function(e) {
    if (e) this.killEvent(e);
    this.visualization.sequence.prev();
  },

  _next: function(e) {
    if (e) this.killEvent(e);
    this.visualization.sequence.next();
  },

  _renderDots: function() {

    var currentActiveSlide = this.slides.state();

    for (var i = 0; i < this.options.transitions.length; i++) {
      var item = new cdb.geo.ui.SlidesControllerItem({ num: i, transition_options: this.options.transitions[i], active: i == currentActiveSlide });
      item.bind("onClick", this._onSlideClick, this);
      this.$el.find("ul").append(item.render().$el);
    }

  },

  _renderCounter: function() {

    var currentActiveSlide = this.slides.state();
    var currentTransition = this.options.transitions[currentActiveSlide];

    var $counter = this.$el.find(".counter");

    if (currentTransition && currentTransition.transition_trigger === "time") {
      $counter.addClass("loading");
    } else {
      $counter.removeClass("loading");
    }

    $counter.html((currentActiveSlide + 1) + "/" + this.options.transitions.length)
  },

  _onSlideClick: function(slide) {
    this.visualization.sequence.current(slide.options.num);
  },

  render: function() {

    var options = _.extend(this.defaults, this.options);

    this.$el.html(this.template(options));

    if (this.slides && this.options.transitions) {

      if (options.show_counter) {
        this._renderCounter(); // we render: 1/N
      } else {
        this._renderDots(); // we render a list of dots
      }

    }

    return this;
  }

});

},{}],49:[function(require,module,exports){
cdb.geo.ui.SwitcherItemModel = Backbone.Model.extend({ });

cdb.geo.ui.SwitcherItems = Backbone.Collection.extend({
  model: cdb.geo.ui.SwitcherItemModel
});

cdb.geo.ui.SwitcherItem = cdb.core.View.extend({

  tagName: "li",

  events: {

    "click a" : "select"

  },

  initialize: function() {

    _.bindAll(this, "render");
    this.template = cdb.templates.getTemplate('templates/map/switcher/item');
    this.parent = this.options.parent;
    this.model.on("change:selected", this.render);

  },

  select: function(e) {
    e.preventDefault();
    this.parent.toggle(this);
    var callback = this.model.get("callback");

    if (callback) {
      callback();
    }

  },

  render: function() {

    if (this.model.get("selected") == true) {
      this.$el.addClass("selected");
    } else {
      this.$el.removeClass("selected");
    }

    this.$el.html(this.template(this.model.toJSON()));
    return this.$el;

  }

});

cdb.geo.ui.Switcher = cdb.core.View.extend({

  id: "switcher",

  default_options: {

  },

  initialize: function() {

    this.map = this.model;

    this.add_related_model(this.model);

    _.bindAll(this, "render", "show", "hide", "toggle");

    _.defaults(this.options, this.default_options);

    if (this.collection) {
      this.model.collection = this.collection;
    }

    this.template = this.options.template ? this.options.template : cdb.templates.getTemplate('geo/switcher');
  },

  show: function() {
    this.$el.fadeIn(250);
  },

  hide: function() {
    this.$el.fadeOut(250);
  },

  toggle: function(clickedItem) {

    if (this.collection) {
      this.collection.each(function(item) {
        item.set("selected", !item.get("selected"));
      });
    }

  },

  render: function() {
    var self = this;

    if (this.model != undefined) {
      this.$el.html(this.template(this.model.toJSON()));
    }

    if (this.collection) {

      this.collection.each(function(item) {

        var view = new cdb.geo.ui.SwitcherItem({ parent: self, className: item.get("className"), model: item });
        self.$el.find("ul").append(view.render());

      });
    }

    return this;
  }

});

},{}],50:[function(require,module,exports){
cdb.geo.ui.Text = cdb.core.View.extend({

  className: "cartodb-overlay overlay-text",

  events: {
    "click": "stopPropagation"
  },

  default_options: { },

  stopPropagation: function(e) {

    e.stopPropagation();

  },

  initialize: function() {

    _.defaults(this.options, this.default_options);

    this.template = this.options.template;

    var self = this;

    $(window).on("map_resized", function() {
      self._place();
    });

    $(window).on("resize", function() {
      self._place();
    });

  },

  _applyStyle: function() {

    var style      = this.model.get("style");

    var boxColor   = style["box-color"];
    var boxOpacity = style["box-opacity"];
    var boxWidth   = style["box-width"];
    var fontFamily = style["font-family-name"];

    this.$text = this.$el.find(".text");

    this.$text.css(style);
    this.$text.css("font-size", style["font-size"] + "px");

    this.$el.css("z-index", style["z-index"]);

    var fontFamilyClass = "";

    if      (fontFamily  == "Droid Sans")       fontFamilyClass = "droid";
    else if (fontFamily  == "Vollkorn")         fontFamilyClass = "vollkorn";
    else if (fontFamily  == "Open Sans")        fontFamilyClass = "open_sans";
    else if (fontFamily  == "Roboto")           fontFamilyClass = "roboto";
    else if (fontFamily  == "Lato")             fontFamilyClass = "lato";
    else if (fontFamily  == "Graduate")         fontFamilyClass = "graduate";
    else if (fontFamily  == "Gravitas One")     fontFamilyClass = "gravitas_one";
    else if (fontFamily  == "Old Standard TT")  fontFamilyClass = "old_standard_tt";

    var rgbaCol = 'rgba(' + parseInt(boxColor.slice(-6,-4),16)
    + ',' + parseInt(boxColor.slice(-4,-2),16)
    + ',' + parseInt(boxColor.slice(-2),16)
    +', ' + boxOpacity + ' )';

    this.$el
    .removeClass("droid")
    .removeClass("vollkorn")
    .removeClass("roboto")
    .removeClass("open_sans")
    .removeClass("lato")
    .removeClass("graduate")
    .removeClass("gravitas_one")
    .removeClass("old_standard_tt");

    this.$el.addClass(fontFamilyClass);
    this.$el.css({
      backgroundColor: rgbaCol,
      maxWidth:        boxWidth
    });

  },

  _place: function(position) {

    var extra = position || this.model.get("extra");

    var top   = this.model.get("y");
    var left  = this.model.get("x");

    var bottom_position = extra.bottom - this.$el.height();
    var right_position  = extra.right  - this.$el.width();

    // position percentages
    var top_percentage  = extra.top_percentage;
    var left_percentage = extra.left_percentage;

    var right  = "auto";
    var bottom = "auto";

    var marginTop  = 0;
    var marginLeft = 0;

    var width  = extra.width;
    var height = extra.height;

    var portrait_dominant_side  = extra.portrait_dominant_side;
    var landscape_dominant_side = extra.landscape_dominant_side;

    if (portrait_dominant_side === 'bottom' && bottom_position <= 250) {

      top = "auto";
      bottom = bottom_position;

    } else if (top_percentage > 45 && top_percentage < 55) {

      top = "50%";
      marginTop = -height/2;

    }

    if (landscape_dominant_side === 'right' && right_position <= 250) {

      left = "auto";
      right = right_position;

    } else if (left_percentage > 45 && left_percentage < 55) {

      left = "50%";
      marginLeft = -width/2;

    }

    this.$el.css({
      marginLeft: marginLeft,
      marginTop: marginTop,
      top: top,
      left: left,
      right: right,
      bottom: bottom
    });

  },

  show: function(callback) {
    this.$el.fadeIn(150, function() {
      callback && callback();
    });
  },

  hide: function(callback) {
    this.$el.fadeOut(150, function() {
      callback && callback();
    });
  },

  _fixLinks: function() {

    this.$el.find("a").each(function(i, link) {
      $(this).attr("target", "_top");
    });

  },

  render: function() {
    var text = cdb.core.sanitize.html(this.model.get("extra").rendered_text, this.model.get('sanitizeText'));
    var data = _.chain(this.model.attributes).clone().extend({ text: text }).value();
    this.$el.html(this.template(data));

    this._fixLinks();

    var self = this;
    setTimeout(function() {
      self._applyStyle();
      self._place();
      self.show();
    }, 900);

    return this;

  }

});

},{}],51:[function(require,module,exports){
/**
 * Show or hide tiles loader
 *
 * Usage:
 *
 * var tiles_loader = new cdb.geo.ui.TilesLoader();
 * mapWrapper.$el.append(tiles_loader.render().$el);
 *
 */


cdb.geo.ui.TilesLoader = cdb.core.View.extend({

  className: "cartodb-tiles-loader",

  default_options: {
    animationSpeed: 500
  },

  initialize: function() {
    _.defaults(this.options, this.default_options);
    this.isVisible = 0;
    this.template = this.options.template ? this.options.template : cdb.templates.getTemplate('geo/tiles_loader');
  },

  render: function() {
    this.$el.html($(this.template(this.options)));
    return this;
  },

  show: function(ev) {
    if(this.isVisible) return;
    if (!cdb.core.util.ie || (cdb.core.util.browser.ie && cdb.core.util.browser.ie.version >= 10)) {
      this.$el.fadeTo(this.options.animationSpeed, 1)
    } else {
      this.$el.show();
    }
    this.isVisible++;
  },

  hide: function(ev) {
    this.isVisible--;
    if(this.isVisible > 0) return;
    this.isVisible = 0;
    if (!cdb.core.util.ie || (cdb.core.util.browser.ie && cdb.core.util.browser.ie.version >= 10)) {
      this.$el.stop(true).fadeTo(this.options.animationSpeed, 0)
    } else {
      this.$el.hide();
    }
  },

  visible: function() {
    return this.isVisible > 0;
  }

});

},{}],52:[function(require,module,exports){

cdb.geo.ui.Tooltip = cdb.geo.ui.InfoBox.extend({

  defaultTemplate: '<p>{{text}}</p>',
  className: 'cartodb-tooltip',

  defaults: {
    vertical_offset: 0,
    horizontal_offset: 0,
    position: 'top|center'
  },

  initialize: function() {
    if(!this.options.mapView) {
      throw new Error("mapView should be present");
    }
    this.options.template = this.options.template || this.defaultTemplate;
    cdb.geo.ui.InfoBox.prototype.initialize.call(this);
    this._filter = null;
    this.showing = false;
    this.showhideTimeout = null;
  },

  setLayer: function(layer) {
    this.options.layer = layer;
    return this;
  },

  /**
   * sets a filter to open the tooltip. If the feature being hovered
   * pass the filter the tooltip is shown
   * setFilter(null) removes the filter
   */
  setFilter: function(f) {
    this._filter = f;
    return this;
  },

  setFields: function(fields) {
    this.options.fields = fields;
    return this;
  },

  setAlternativeNames: function(n) {
    this.options.alternative_names = n;
  },

  enable: function() {
    if(this.options.layer) {
      // unbind previous events
      this.options.layer.unbind(null, null, this);
      this.options.layer
        .on('mouseover', function(e, latlng, pos, data) {

          if (this.options.fields && this.options.fields.length > 0) {

            var non_valid_keys = ['fields', 'content'];

            if (this.options.omit_columns) {
              non_valid_keys = non_valid_keys.concat(this.options.omit_columns);
            }

            var c = cdb.geo.ui.InfowindowModel.contentForFields(data, this.options.fields, {
              empty_fields: this.options.empty_fields
            });

            // Remove fields and content from data
            // and make them visible for custom templates
            data.content = _.omit(data, non_valid_keys);

            // loop through content values
            data.fields = c.fields;

            // alternamte names
            var names = this.options.alternative_names;
            if (names) {
              for(var i = 0; i < data.fields.length; ++i) {
                var f = data.fields[i];
                f.title = names[f.title] || f.title;
              }
            }
            this.show(pos, data);
            this.showing = true;
          } else if (this.showing) {
            this.hide();
            this.showing = false;
          }
        }, this)
        .on('mouseout', function() {
          if (this.showing) {
            this.hide();
            this.showing = false;
          }
        }, this);
      this.add_related_model(this.options.layer);
    }
  },

  disable: function() {
    if(this.options.layer) {
      this.options.layer.unbind(null, null, this);
    }
    this.hide();
    this.showing = false;
  },

  _visibility: function() {
    var self = this;
    clearTimeout(this.showhideTimeout);
    this.showhideTimeout = setTimeout(self._showing ?
      function() { self.$el.fadeIn(100); }
      :
      function() { self.$el.fadeOut(200); }
    , 50);
  },

  hide: function() {
    if (this._showing) {
      this._showing = false;
      this._visibility();
    }
  },

  show: function(pos, data) {
    if (this._filter && !this._filter(data)) {
      return this;
    }
    this.render(data);
    //this.elder('show', pos, data);
    this.setPosition(pos);
    if (!this._showing) {
      this._showing = true;
      this._visibility();
    }
    return this;
  },

  setPosition: function(point) {
    var pos = this.options.position;
    var height = this.$el.innerHeight();
    var width = this.$el.innerWidth();
    var mapViewSize = this.options.mapView.getSize();
    var top = 0;
    var left = 0;

    // Vertically
    if (pos.indexOf('top') !== -1) {
      top = point.y - height;
    } else if (pos.indexOf('middle') !== -1) {
      top = point.y - (height/2);
    } else { // bottom
      top = point.y;
    }

    // Fix vertical overflow
    if (top < 0) {
      top = point.y;
    } else if (top + height > mapViewSize.y) {
      top = point.y - height;
    }

    // Horizontally
    if(pos.indexOf('left') !== -1) {
      left = point.x - width;
    } else if(pos.indexOf('center') !== -1) {
      left = point.x - (width/2);
    } else { // right
      left = point.x;
    }

    // Fix horizontal overflow
    if (left < 0) {
      left = point.x;
    } else if (left + width > mapViewSize.x) {
      left = point.x - width;
    }

    // Add offsets
    top += this.options.vertical_offset;
    left += this.options.horizontal_offset;

    this.$el.css({
      top:  top,
      left: left
    });
  },

  render: function(data) {
    var sanitizedOutput = cdb.core.sanitize.html(this.template(data));
    this.$el.html( sanitizedOutput );
    return this;
  }

});

},{}],53:[function(require,module,exports){
/**
 * View to control the zoom of the map.
 *
 * Usage:
 *
 * var zoomControl = new cdb.geo.ui.Zoom({ model: map });
 * mapWrapper.$el.append(zoomControl.render().$el);
 *
 */


cdb.geo.ui.Zoom = cdb.core.View.extend({

  className: "cartodb-zoom",

  events: {
    'click .zoom_in': 'zoom_in',
    'click .zoom_out': 'zoom_out'
  },

  default_options: {
    timeout: 0,
    msg: ''
  },

  initialize: function() {
    this.map = this.model;

    _.defaults(this.options, this.default_options);

    this.template = this.options.template ? this.options.template : cdb.templates.getTemplate('geo/zoom');
    this.map.bind('change:zoom change:minZoom change:maxZoom', this._checkZoom, this);
  },

  render: function() {
    this.$el.html(this.template(this.options));
    this._checkZoom();
    return this;
  },

  _checkZoom: function() {
    var zoom = this.map.get('zoom');
    this.$('.zoom_in')[ zoom < this.map.get('maxZoom') ? 'removeClass' : 'addClass' ]('disabled')
    this.$('.zoom_out')[ zoom > this.map.get('minZoom') ? 'removeClass' : 'addClass' ]('disabled')
  },

  zoom_in: function(ev) {
    if (this.map.get("maxZoom") > this.map.getZoom()) {
      this.map.setZoom(this.map.getZoom() + 1);
    }
    ev.preventDefault();
    ev.stopPropagation();
  },

  zoom_out: function(ev) {
    if (this.map.get("minZoom") < this.map.getZoom()) {
      this.map.setZoom(this.map.getZoom() - 1);
    }
    ev.preventDefault();
    ev.stopPropagation();
  }

});

},{}],54:[function(require,module,exports){
/**
 * View to know which is the map zoom.
 *
 * Usage:
 *
 * var zoomInfo = new cdb.geo.ui.ZoomInfo({ model: map });
 * mapWrapper.$el.append(zoomInfo.render().$el);
 *
 */


cdb.geo.ui.ZoomInfo = cdb.core.View.extend({

  className: "cartodb-zoom-info",

  initialize: function() {
    this.model.bind("change:zoom", this.render, this);
  },

  render: function() {
    this.$el.html(this.model.get("zoom"));
    return this;
  }
});

},{}],55:[function(require,module,exports){
/**
 * generic dialog
 *
 * this opens a dialog in the middle of the screen rendering
 * a dialog using cdb.templates 'common/dialog' or template_base option.
 *
 * inherit class should implement render_content (it could return another widget)
 *
 * usage example:
 *
 *    var MyDialog = cdb.ui.common.Dialog.extend({
 *      render_content: function() {
 *        return "my content";
 *      },
 *    })
 *    var dialog = new MyDialog({
 *        title: 'test',
 *        description: 'long description here',
 *        template_base: $('#base_template').html(),
 *        width: 500
 *    });
 *
 *    $('body').append(dialog.render().el);
 *    dialog.open();
 *
 * TODO: implement draggable
 * TODO: modal
 * TODO: document modal_type
 */

cdb.ui.common.Dialog = cdb.core.View.extend({

  tagName: 'div',
  className: 'dialog',

  events: {
    'click .ok': '_ok',
    'click .cancel': '_cancel',
    'click .close': '_cancel'
  },

  default_options: {
    title: 'title',
    description: '',
    ok_title: 'Ok',
    cancel_title: 'Cancel',
    width: 300,
    height: 200,
    clean_on_hide: false,
    enter_to_confirm: false,
    template_name: 'old_common/views/dialog_base',
    ok_button_classes: 'button green',
    cancel_button_classes: '',
    modal_type: '',
    modal_class: '',
    include_footer: true,
    additionalButtons: []
  },

  initialize: function() {
    _.defaults(this.options, this.default_options);

    _.bindAll(this, 'render', '_keydown');

    // Keydown bindings for the dialog
    $(document).bind('keydown', this._keydown);

    // After removing the dialog, cleaning other bindings
    this.bind("clean", this._reClean);

    this.template_base = this.options.template_base ? _.template(this.options.template_base) : cdb.templates.getTemplate(this.options.template_name);
  },

  render: function() {
    var $el = this.$el;

    $el.html(this.template_base(this.options));

    $el.find(".modal").css({
      width: this.options.width
      //height: this.options.height
      //'margin-left': -this.options.width>>1,
      //'margin-top': -this.options.height>>1
    });

    if(this.render_content) {

      this.$('.content').append(this.render_content());
    }

    if(this.options.modal_class) {
      this.$el.addClass(this.options.modal_class);
    }

    return this;
  },


  _keydown: function(e) {
    // If clicks esc, goodbye!
    if (e.keyCode === 27) {
      this._cancel();
    // If clicks enter, same as you click on ok button.
    } else if (e.keyCode === 13 && this.options.enter_to_confirm) {
      this._ok();
    }
  },

  /**
   * helper method that renders the dialog and appends it to body
   */
  appendToBody: function() {
    $('body').append(this.render().el);
    return this;
  },

  _ok: function(ev) {

   if(ev) ev.preventDefault();

    if (this.ok) {
      this.ok(this.result);
    }

    this.hide();

  },

  _cancel: function(ev) {

    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    if (this.cancel) {
      this.cancel();
    }

    this.hide();

  },

  hide: function() {

    this.$el.hide();

    if (this.options.clean_on_hide) {
      this.clean();
    }

  },

  open: function() {

    this.$el.show();

  },

  _reClean: function() {

    $(document).unbind('keydown', this._keydown);

  }

});

},{}],56:[function(require,module,exports){
/**
 * Show a dropdown from the target
 *
 * It shows the several options of the user settings
 *
 * usage example:
 *
 *    var settings = new cdb.ui.common.Dropdown({
 *        el: "#settings_element",
 *        speedIn: 300,
 *        speedOut: 200
 *    });
 *    // show it
 *    settings.show();
 *    // close it
 *    settings.close();
*/

cdb.ui.common.Dropdown = cdb.core.View.extend({

  tagName: 'div',
  className: 'dropdown',

  events: {
    "click ul li a" : "_fireClick"
  },

  default_options: {
    width: 160,
    speedIn: 150,
    speedOut: 300,
    vertical_position: "down",
    horizontal_position: "right",
    tick: "right",
    vertical_offset: 0,
    horizontal_offset: 0
  },

  initialize: function() {
    _.bindAll(this, "open", "hide", "_handleClick", "_keydown");

    // Extend options
    _.defaults(this.options, this.default_options);

    // Dropdown template
    if (this.options.template_base) {
      this.template_base = cdb.templates.getTemplate(this.options.template_base);
    } else if (this.options.template) {
      this.template_base = this.options.template;
    }

    // Bind to target
    $(this.options.target).bind({"click": this._handleClick});

    // Bind ESC key
    $(document).bind('keydown', this._keydown);

    // Is open flag
    this.isOpen = false;

  },

  render: function() {
    // Render
    var $el = this.$el;
    $el
      .html(this.template_base(this.options))
      .css({
        width: this.options.width
      })
    return this;
  },

  _handleClick: function(ev) {
    //Check if the dropdown is visible to hiding with the click on the target
    if (ev){
      ev.preventDefault();
      ev.stopPropagation();
    }
    // If visible
    if (this.isOpen){
      this.hide();
    }else{
      this.open();
    }
  },

  _keydown: function(e) {
    if (e.keyCode === 27) {
      this.hide();
    }
  },

  hide: function() {
    this.isOpen = false;
    this.$el.hide();
  },

  show: function() {
    this.$el.css({
      display: "block",
      opacity: 1
    });
    this.isOpen = true;
  },

  open: function(ev,target) {
    // Target
    var $target = target && $(target) || this.options.target;
    this.options.target = $target;

    // Positionate
    var targetPos     = $target[this.options.position || 'offset']()
      , targetWidth   = $target.outerWidth()
      , targetHeight  = $target.outerHeight()
      , elementWidth  = this.$el.outerWidth()
      , elementHeight = this.$el.outerHeight()
      , self = this;

    this.$el.css({
      top: targetPos.top + parseInt((self.options.vertical_position == "up") ? (- elementHeight - 10 - self.options.vertical_offset) : (targetHeight + 10 - self.options.vertical_offset)),
      left: targetPos.left + parseInt((self.options.horizontal_position == "left") ? (self.options.horizontal_offset - 15) : (targetWidth - elementWidth + 15 - self.options.horizontal_offset))
    })
    .addClass(
      // Add vertical and horizontal position class
      (this.options.vertical_position == "up" ? "vertical_top" : "vertical_bottom" )
      + " " +
      (this.options.horizontal_position == "right" ? "horizontal_right" : "horizontal_left" )
      + " " +
      // Add tick class
      "tick_" + this.options.tick
    )

    // Show it
    this.show();

    // Dropdown openned
    this.isOpen = true;
  },

  clean: function() {
    $(this.options.target).unbind({"click": this._handleClick});
    $(document).unbind('keydown', this._keydown);
    cdb.core.View.prototype.clean.apply(this, arguments);
  },

  _fireClick: function(ev) {
    this.trigger("optionClicked", ev, this.el);
  }
});

},{}],57:[function(require,module,exports){
/**
 * generic embbed notification, like twitter "new notifications"
 *
 * it shows slowly the notification with a message and a close button.
 * Optionally you can set a timeout to close
 *
 * usage example:
 *
      var notification = new cdb.ui.common.Notificaiton({
          el: "#notification_element",
          msg: "error!",
          timeout: 1000
      });
      notification.show();
      // close it
      notification.close();
*/

cdb.ui.common.Notification = cdb.core.View.extend({

  tagName: 'div',
  className: 'dialog',

  events: {
    'click .close': 'hide'
  },

  default_options: {
      timeout: 0,
      msg: '',
      hideMethod: '',
      duration: 'normal'
  },

  initialize: function() {
    this.closeTimeout = -1;
    _.defaults(this.options, this.default_options);
    this.template = this.options.template ? _.template(this.options.template) : cdb.templates.getTemplate('common/notification');

    this.$el.hide();
  },

  render: function() {
    var $el = this.$el;
    $el.html(this.template(this.options));
    if(this.render_content) {
      this.$('.content').append(this.render_content());
    }
    return this;
  },

  hide: function(ev) {
    var self = this;
    if (ev)
      ev.preventDefault();
    clearTimeout(this.closeTimeout);
    if(this.options.hideMethod != '' && this.$el.is(":visible") ) {
      this.$el[this.options.hideMethod](this.options.duration, 'swing', function() {
        self.$el.html('');
        self.trigger('notificationDeleted');
        self.remove();
      });
    } else {
      this.$el.hide();
      self.$el.html('');
      self.trigger('notificationDeleted');
      self.remove();
    }

  },

  open: function(method, options) {
    this.render();
    this.$el.show(method, options);
    if(this.options.timeout) {
        this.closeTimeout = setTimeout(_.bind(this.hide, this), this.options.timeout);
    }
  }

});


},{}],58:[function(require,module,exports){

cdb.ui.common.ShareDialog = cdb.ui.common.Dialog.extend({

  tagName: 'div',
  className: 'cartodb-share-dialog',

  events: {
    'click .ok':       '_ok',
    'click .cancel':   '_cancel',
    'click .close':    '_cancel',
    "click":           '_stopPropagation',
    "dblclick":        '_stopPropagation',
    "mousedown":       '_stopPropagation'
  },

  default_options: {
    title: '',
    description: '',
    ok_title: 'Ok',
    cancel_title: 'Cancel',
    width: 300,
    height: 200,
    clean_on_hide: false,
    enter_to_confirm: false,
    template_name: 'old_common/views/dialog_base',
    ok_button_classes: 'button green',
    cancel_button_classes: '',
    modal_type: '',
    modal_class: '',
    include_footer: true,
    additionalButtons: []
  },

  initialize: function() {

    _.defaults(this.options, this.default_options);

    _.bindAll(this, 'render', '_keydown');

    this.isOpen = false;

    var self = this;

    if (this.options.target) {
      this.options.target.on("click", function(e) {
        e.preventDefault();
        e.stopPropagation();

        self.open();

      })
    }

    // Keydown bindings for the dialog
    $(document).bind('keydown', this._keydown);

    // After removing the dialog, cleaning other bindings
    this.bind("clean", this._reClean);

  },

  _stopPropagation: function(ev) {

    ev.stopPropagation();

  },

  _stripHTML: function(input, allowed) {

    allowed = (((allowed || "") + "").toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('');

    var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

    if (!input || (typeof input != "string")) return '';

    return input.replace(tags, function ($0, $1) {
      return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
    });

  },

  open: function() {

    var self = this;

    this.$el.show(0, function(){
      self.isOpen = true;
    });

  },

  hide: function() {

    var self = this;

    this.$el.hide(0, function(){
      self.isOpen = false;
    });

    if (this.options.clean_on_hide) {
      this.clean();
    }

  },

  toggle: function() {

    if (this.isOpen) {
      this.hide();
    } else {
      this.open();
    }

  },

  _truncateTitle: function(s, length) {

    return s.substr(0, length-1) + (s.length > length ? '…' : '');

  },

  render: function() {

    var $el = this.$el;

    var title             = cdb.core.sanitize.html(this.options.title);
    var description       = cdb.core.sanitize.html(this.options.description);
    var clean_description = this._stripHTML(this.options.description);
    var share_url         = this.options.share_url;

    var facebook_url, twitter_url;

    this.$el.addClass(this.options.size);

    var full_title    = title + ": " + clean_description;
    var twitter_title;

    if (title && clean_description) {
      twitter_title = this._truncateTitle(title + ": " + clean_description, 112) + " %23map "
    } else if (title) {
      twitter_title = this._truncateTitle(title, 112) + " %23map"
    } else if (clean_description){
      twitter_title = this._truncateTitle(clean_description, 112) + " %23map"
    } else {
      twitter_title = "%23map"
    }

    if (this.options.facebook_url) {
      facebook_url = this.options.facebook_url;
    } else {
      facebook_url = "http://www.facebook.com/sharer.php?u=" + share_url + "&text=" + full_title;
    }

    if (this.options.twitter_url) {
      twitter_url = this.options.twitter_url;
    } else {
      twitter_url = "https://twitter.com/share?url=" + share_url + "&text=" + twitter_title;
    }

    var options = _.extend(this.options, { facebook_url: facebook_url, twitter_url: twitter_url });

    $el.html(this.options.template(options));

    $el.find(".modal").css({
      width: this.options.width
    });

    if (this.render_content) {
      this.$('.content').append(this.render_content());
    }

    if(this.options.modal_class) {
      this.$el.addClass(this.options.modal_class);
    }

    if (this.options.disableLinks) {
      this.$el.find("a").attr("target", "");
    }

    return this;
  }

});

},{}],59:[function(require,module,exports){
/**
 * generic table
 *
 * this class creates a HTML table based on Table model (see below) and modify it based on model changes
 *
 * usage example:
 *
      var table = new Table({
          model: table
      });

      $('body').append(table.render().el);

  * model should be a collection of Rows

 */

/**
 * represents a table row
 */
cdb.ui.common.Row = cdb.core.Model.extend({
});

cdb.ui.common.TableData = Backbone.Collection.extend({
    model: cdb.ui.common.Row,
    fetched: false,

    initialize: function() {
      var self = this;
      this.bind('reset', function() {
        self.fetched = true;
      })
    },

    /**
     * get value for row index and columnName
     */
    getCell: function(index, columnName) {
      var r = this.at(index);
      if(!r) {
        return null;
      }
      return r.get(columnName);
    },

    isEmpty: function() {
      return this.length === 0;
    }

});

/**
 * contains information about the table, mainly the schema
 */
cdb.ui.common.TableProperties = cdb.core.Model.extend({

  columnNames: function() {
    return _.map(this.get('schema'), function(c) {
      return c[0];
    });
  },

  columnName: function(idx) {
    return this.columnNames()[idx];
  }
});

/**
 * renders a table row
 */
cdb.ui.common.RowView = cdb.core.View.extend({
  tagName: 'tr',

  initialize: function() {

    this.model.bind('change', this.render, this);
    this.model.bind('destroy', this.clean, this);
    this.model.bind('remove', this.clean, this);
    this.model.bind('change', this.triggerChange, this);
    this.model.bind('sync', this.triggerSync, this);
    this.model.bind('error', this.triggerError, this);

    this.add_related_model(this.model);
    this.order = this.options.order;
  },

  triggerChange: function() {
    this.trigger('changeRow');
  },

  triggerSync: function() {
    this.trigger('syncRow');
  },

  triggerError: function() {
    this.trigger('errorRow')
  },

  valueView: function(colName, value) {
    return value;
  },

  render: function() {
    var self = this;
    var row = this.model;

    var tr = '';

    var tdIndex = 0;
    var td;
    if(this.options.row_header) {
        td = '<td class="rowHeader" data-x="' + tdIndex + '">';
    } else {
        td = '<td class="EmptyRowHeader" data-x="' + tdIndex + '">';
    }
    var v = self.valueView('', '');
    if(v.html) {
      v = v[0].outerHTML;
    }
    td += v;
    td += '</td>';
    tdIndex++;
    tr += td

    var attrs = this.order || _.keys(row.attributes);
    var tds = '';
    var row_attrs = row.attributes;
    for(var i = 0, len = attrs.length; i < len; ++i) {
      var key = attrs[i];
      var value = row_attrs[key];
      if(value !== undefined) {
        var td = '<td id="cell_' + row.id + '_' + key + '" data-x="' + tdIndex + '">';
        var v = self.valueView(key, value);
        if(v.html) {
          v = v[0].outerHTML;
        }
        td += v;
        td += '</td>';
        tdIndex++;
        tds += td;
      }
    }
    tr += tds;
    this.$el.html(tr).attr('id', 'row_' + row.id);
    return this;
  },

  getCell: function(x) {
    var childNo = x;
    if(this.options.row_header) {
      ++x;
    }
    return this.$('td:eq(' + x + ')');
  },

  getTableView: function() {
    return this.tableView;
  }

});

/**
 * render a table
 * this widget needs two data sources
 * - the table model which contains information about the table (columns and so on). See TableProperties
 * - the model with the data itself (TableData)
 */
cdb.ui.common.Table = cdb.core.View.extend({

  tagName: 'table',
  rowView: cdb.ui.common.RowView,

  events: {
      'click td': '_cellClick',
      'dblclick td': '_cellDblClick'
  },

  default_options: {
  },

  initialize: function() {
    var self = this;
    _.defaults(this.options, this.default_options);
    this.dataModel = this.options.dataModel;
    this.rowViews = [];

    // binding
    this.setDataSource(this.dataModel);
    this.model.bind('change', this.render, this);
    this.model.bind('change:dataSource', this.setDataSource, this);

    // assert the rows are removed when table is removed
    this.bind('clean', this.clear_rows, this);

    // prepare for cleaning
    this.add_related_model(this.dataModel);
    this.add_related_model(this.model);

    // we need to use custom signals to make the tableview aware of a row being deleted,
    // because when you delete a point from the map view, sometimes it isn't on the dataModel
    // collection, so its destroy doesn't bubble throught there.
    // Also, the only non-custom way to acknowledge that a row has been correctly deleted from a server is with
    // a sync, that doesn't bubble through the table
    this.model.bind('removing:row', function() {
      self.rowsBeingDeleted = self.rowsBeingDeleted ? self.rowsBeingDeleted +1 : 1;
      self.rowDestroying();
    });
    this.model.bind('remove:row', function() {
      if(self.rowsBeingDeleted > 0) {
        self.rowsBeingDeleted--;
        self.rowDestroyed();
        if(self.dataModel.length == 0) {
          self.emptyTable();
        }
      }
    });

  },

  headerView: function(column) {
      return column[0];
  },

  setDataSource: function(dm) {
    if(this.dataModel) {
      this.dataModel.unbind(null, null, this);
    }
    this.dataModel = dm;
    this.dataModel.bind('reset', this._renderRows, this);
    this.dataModel.bind('error', this._renderRows, this);
    this.dataModel.bind('add', this.addRow, this);
  },

  _renderHeader: function() {
    var self = this;
    var thead = $("<thead>");
    var tr = $("<tr>");
    if(this.options.row_header) {
      tr.append($("<th>").append(self.headerView(['', 'header'])));
    } else {
      tr.append($("<th>").append(self.headerView(['', 'header'])));
    }
    _(this.model.get('schema')).each(function(col) {
      tr.append($("<th>").append(self.headerView(col)));
    });
    thead.append(tr);
    return thead;
  },

  /**
   * remove all rows
   */
  clear_rows: function() {
    this.$('tfoot').remove();
    this.$('tr.noRows').remove();

    // unbind rows before cleaning them when all are gonna be removed
    var rowView = null;
    while(rowView = this.rowViews.pop()) {
      // this is a hack to avoid all the elements are removed one by one
      rowView.unbind(null, null, this);
      // each element removes itself from rowViews
      rowView.clean();
    }
    // clean all the html at the same time
    this.rowViews = [];
  },

  /**
   * add rows
   */
  addRow: function(row, collection, options) {
    var self = this;
    var tr = new self.rowView({
      model: row,
      order: this.model.columnNames(),
      row_header: this.options.row_header
    });
    tr.tableView = this;

    tr.bind('clean', function() {
      var idx = _.indexOf(self.rowViews, tr);
      self.rowViews.splice(idx, 1);
      // update index
      for(var i = idx; i < self.rowViews.length; ++i) {
        self.rowViews[i].$el.attr('data-y', i);
      }
    }, this);
    tr.bind('changeRow', this.rowChanged, this);
    tr.bind('saved', this.rowSynched, this);
    tr.bind('errorSaving', this.rowFailed, this);
    tr.bind('saving', this.rowSaving, this);
    this.retrigger('saving', tr);

    tr.render();
    if(options && options.index !== undefined && options.index != self.rowViews.length) {

      tr.$el.insertBefore(self.rowViews[options.index].$el);
      self.rowViews.splice(options.index, 0, tr);
      //tr.$el.attr('data-y', options.index);
      // change others view data-y attribute
      for(var i = options.index; i < self.rowViews.length; ++i) {
        self.rowViews[i].$el.attr('data-y', i);
      }
    } else {
      // at the end
      tr.$el.attr('data-y', self.rowViews.length);
      self.$el.append(tr.el);
      self.rowViews.push(tr);
    }

    this.trigger('createRow');
  },

  /**
  * Callback executed when a row change
  * @method rowChanged
  * @abstract
  */
  rowChanged: function() {},

  /**
  * Callback executed when a row is sync
  * @method rowSynched
  * @abstract
  */
  rowSynched: function() {},

  /**
  * Callback executed when a row fails to reach the server
  * @method rowFailed
  * @abstract
  */
  rowFailed: function() {},

  /**
  * Callback executed when a row send a POST to the server
  * @abstract
  */
  rowSaving: function() {},

  /**
  * Callback executed when a row is being destroyed
  * @method rowDestroyed
  * @abstract
  */
  rowDestroying: function() {},

  /**
  * Callback executed when a row gets destroyed
  * @method rowDestroyed
  * @abstract
  */
  rowDestroyed: function() {},

  /**
  * Callback executed when a row gets destroyed and the table data is empty
  * @method emptyTable
  * @abstract
  */
  emptyTable: function() {},

  /**
  * Checks if the table is empty
  * @method isEmptyTable
  * @returns boolean
  */
  isEmptyTable: function() {
    return (this.dataModel.length === 0 && this.dataModel.fetched)
  },

  /**
   * render only data rows
   */
  _renderRows: function() {
    this.clear_rows();
    if(! this.isEmptyTable()) {
      if(this.dataModel.fetched) {
        var self = this;

        this.dataModel.each(function(row) {
          self.addRow(row);
        });
      } else {
        this._renderLoading();
      }
    } else {
      this._renderEmpty();
    }

  },

  _renderLoading: function() {
  },

  _renderEmpty: function() {
  },

  /**
  * Method for the children to redefine with the table behaviour when it has no rows.
  * @method addEmptyTableInfo
  * @abstract
  */
  addEmptyTableInfo: function() {
    // #to be overwrite by descendant classes
  },

  /**
   * render table
   */
  render: function() {
    var self = this;

    // render header
    self.$el.html(self._renderHeader());

    // render data
    self._renderRows();

    return this;

  },

  /**
   * return jquery cell element of cell x,y
   */
  getCell: function(x, y) {
    if(this.options.row_header) {
      ++y;
    }
    return this.rowViews[y].getCell(x);
  },

  _cellClick: function(e, evtName) {
    evtName = evtName || 'cellClick';
    e.preventDefault();
    var cell = $(e.currentTarget || e.target);
    var x = parseInt(cell.attr('data-x'), 10);
    var y = parseInt(cell.parent().attr('data-y'), 10);
    this.trigger(evtName, e, cell, x, y);
  },

  _cellDblClick: function(e) {
    this._cellClick(e, 'cellDblClick');
  }


});

},{}],60:[function(require,module,exports){
(function() {

  Queue = function() {

    // callback storage
    this._methods = [];

    // reference to the response
    this._response = null;

    // all queues start off unflushed
    this._flushed = false;

  };

  Queue.prototype = {

    // adds callbacks to the queue
    add: function(fn) {

      // if the queue had been flushed, return immediately
      if (this._flushed) {

        // otherwise push it on the queue
        fn(this._response);

      } else {
        this._methods.push(fn);
      }

    },

    flush: function(resp) {

      // flush only ever happens once
      if (this._flushed) {
        return;
      }

      // store the response for subsequent calls after flush()
      this._response = resp;

      // mark that it's been flushed
      this._flushed = true;

      // shift 'em out and call 'em back
      while (this._methods[0]) {
        this._methods.shift()(resp);
      }

    }

  };

  StaticImage = function() {

    MapBase.call(this, this);

    this.imageOptions = {};

    this.error = null;

    this.supported_formats = ["png", "jpg"];

    this.defaults = {
      basemap_url_template: "http://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      basemap_subdomains: ["a", "b", "c"],
      format: "png",
      zoom: 10,
      center: [0, 0],
      size:  [320, 240],
      tiler_port: 80,
      tiler_domain: "cartodb.com"
    };

  };

  StaticImage.prototype = _.extend({}, MapBase.prototype, {

    load: function(vizjson, options) {

      _.bindAll(this, "_onVisLoaded");

      this.queue = new Queue;

      this.no_cdn = options.no_cdn;

      this.userOptions = options;

      options = _.defaults({ vizjson: vizjson, temp_id: "s" + this._getUUID() }, this.defaults);

      this.imageOptions = options;

      cdb.core.Loader.get(vizjson, this._onVisLoaded);

      return this;

    },

    loadLayerDefinition: function(layerDefinition, options) {

      var self = this;

      this.queue = new Queue;

      if (!layerDefinition.user_name) {
        cartodb.log.error("Please, specify the username");
        return;
      }

      this.userOptions = options;

      this.options.api_key        = layerDefinition.api_key;
      this.options.user_name      = layerDefinition.user_name;
      this.options.tiler_protocol = layerDefinition.tiler_protocol;
      this.options.tiler_domain   = layerDefinition.tiler_domain;
      this.options.tiler_port     = layerDefinition.tiler_port;
      this.options.maps_api_template = layerDefinition.maps_api_template;
      this.endPoint = "/api/v1/map";

      if (!this.options.maps_api_template) {
        this._buildMapsApiTemplate(this.options);
      }

      this.options.layers = layerDefinition;

      this._requestLayerGroupID();

    },

    _onVisLoaded: function(data) {

      if (data) {

        var layerDefinition;
        var baseLayer = data.layers[0];
        var dataLayer = this._getDataLayer(data.layers);

        if (dataLayer.options) {
          this.options.user_name = dataLayer.options.user_name;
        }

        // keep this for backward compatibility with tiler_* variables
        if (!dataLayer.options.maps_api_template) {
          this._setupTilerConfiguration(dataLayer.options.tiler_protocol, dataLayer.options.tiler_domain, dataLayer.options.tiler_port);
        } else {
          this.options.maps_api_template = dataLayer.options.maps_api_template;
        }

        this.auth_tokens = data.auth_tokens;
        this.endPoint = "/api/v1/map";

        var bbox = [];
        var bounds = data.bounds;

        if (bounds) {
          bbox.push([bounds[0][1], bounds[0][0]]);
          bbox.push([bounds[1][1], bounds[1][0]]);
        }

        this.imageOptions.zoom   = data.zoom;
        this.imageOptions.center = JSON.parse(data.center);
        this.imageOptions.bbox   = bbox;
        this.imageOptions.bounds = data.bounds;

        if (baseLayer && baseLayer.options) {
          this.imageOptions.basemap = baseLayer;
        }

        /* If the vizjson contains a named map and a torque layer with a named map,
           ignore the torque layer */
        var ignoreTorqueLayer = false;
        var namedMap = this._getLayerByType(data.layers, "namedmap");

        if (namedMap) {
          var torque = this._getLayerByType(data.layers, "torque");

          if (torque && torque.options && torque.options.named_map) {

            if (torque.options.named_map.name === namedMap.options.named_map.name) {
              ignoreTorqueLayer = true;
            }
          }
        }

        var layers = [];
        var basemap = this._getBasemapLayer();

        if (basemap) {
          layers.push(basemap);
        }

        var labelsLayer;
        for (var i = 1; i < data.layers.length; i++) {
          var layer = data.layers[i];

          if (layer.type === "torque" && !ignoreTorqueLayer) {
            layers.push(this._getTorqueLayerDefinition(layer));
          } else if (layer.type === "namedmap") {
            layers.push(this._getNamedmapLayerDefinition(layer));
          } else if (layer.type === "tiled") {
            labelsLayer = this._getHTTPLayer(layer);
          } else if (layer.type !== "torque" && layer.type !== "namedmap") {
            var ll = this._getLayergroupLayerDefinition(layer);

            for (var j = 0; j < ll.length; j++) {
              layers.push(ll[j]);
            }
          }
        }

        // If there's a second `tiled` layer, it's a layer with labels and
        // it needs to be on top of all other layers
        if (labelsLayer) {
          layers.push(labelsLayer);
        }

        this.options.layers = { layers: layers };
        this._requestLayerGroupID();
      }
    },

    _getDataLayer: function(layers) {
      return this._getLayerByType(layers, "namedmap") ||
        this._getLayerByType(layers, "layergroup") ||
          this._getLayerByType(layers, "torque");
    },

    visibleLayers: function() {
      // Overwrites the layer_definition method.
      // We return all the layers, since we have filtered them before
      return this.options.layers.layers;
    },

    _getLayerByType: function(layers, type) {
      return _.find(layers, function(layer) { return layer.type === type; });
    },

    _setupTilerConfiguration: function(protocol, domain, port) {

      this.options.tiler_domain   = domain;
      this.options.tiler_protocol = protocol;
      this.options.tiler_port     = port;

      this._buildMapsApiTemplate(this.options);

    },

    toJSON: function(){
      return this.options.layers;
    },

    _requestLayerGroupID: function() {

      var self = this;

      this.createMap(function(data, error) {

        if (error) {
          self.error = error;
        }

        if (data) {
          self.imageOptions.layergroupid = data.layergroupid;
          self.cdn_url = data.cdn_url;
        }

        self.queue.flush(this);

      });

    },

    _getDefaultBasemapLayer: function() {

      return {
        type: "http",
        options: {
          urlTemplate: this.defaults.basemap_url_template,
          subdomains:  this.defaults.basemap_subdomains
        }
      };

    },

    _getHTTPLayer: function(basemap) {

      var urlTemplate = basemap.options.urlTemplate;

      if (!urlTemplate) {
        return null;
      }

      return {
        type: "http",
        options: {
          urlTemplate: urlTemplate,
          subdomains: basemap.options.subdomains || this.defaults.basemap_subdomains
        }
      };

    },

    _getPlainBasemapLayer: function(color) {

      return {
        type: "plain",
        options: {
          color: color
        }
      };

    },

    _getBasemapLayer: function() {

      var basemap = this.userOptions.basemap || this.imageOptions.basemap;

      if (basemap) {

        // TODO: refactor this
        var type = basemap.type.toLowerCase();

        if (basemap.options && basemap.options.type) {
          type = basemap.options.type.toLowerCase();
        }

        if (type === "plain") {
          return this._getPlainBasemapLayer(basemap.options.color);
        } else {
          return this._getHTTPLayer(basemap);
        }

      }

      return this._getDefaultBasemapLayer();

    },

    _getTorqueLayerDefinition: function(layer_definition) {

      if (layer_definition.options.named_map) { // If the layer contains a named map inside, use it instead
        return this._getNamedmapLayerDefinition(layer_definition);
      }

      var layerDefinition = new LayerDefinition(layer_definition, layer_definition.options);

      var query    = layerDefinition.options.query || "SELECT * FROM " + layerDefinition.options.table_name;
      var cartocss = layer_definition.options.tile_style;

      return {
        type: "torque",
        options: {
          step: this.userOptions.step || 0,
          sql: query,
          cartocss: cartocss
        }
      };

    },

    _getLayergroupLayerDefinition: function(layer) {

      var options = layer.options;

      options.layer_definition.layers = this._getVisibleLayers(options.layer_definition.layers);

      var layerDefinition = new LayerDefinition(options.layer_definition, options);

      return layerDefinition.toJSON().layers;

    },

    _getNamedmapLayerDefinition: function(layer) {

      var options = layer.options;

      var layerDefinition = new NamedMap(options.named_map, options);

      var options = {
        name: layerDefinition.named_map.name
      };

      if (this.auth_tokens && this.auth_tokens.length > 0) {
        options.auth_tokens = this.auth_tokens;
      }

      return {
        type: "named",
        options: options
      }

    },

    _getVisibleLayers: function(layers) {
      return _.filter(layers, function(layer) { return layer.visible; });
    },

    _getUrl: function() {

      var username     = this.options.user_name;
      var bbox         = this.imageOptions.bbox;
      var layergroupid = this.imageOptions.layergroupid;
      var zoom         = this.imageOptions.zoom   || this.defaults.zoom;
      var center       = this.imageOptions.center || this.defaults.center;
      var size         = this.imageOptions.size   || this.defaults.size;
      var format       = this.imageOptions.format || this.defaults.format;

      var lat    = center[0];
      var lon    = center[1];

      var width  = size[0];
      var height = size[1];

      var subhost = this.isHttps() ? null : "a";

      var url = this._host(subhost) + this.endPoint;

      if (bbox && bbox.length && !this.userOptions.override_bbox) {
        return [url, "static/bbox" , layergroupid, bbox.join(","), width, height + "." + format].join("/");
      } else {
        return [url, "static/center" , layergroupid, zoom, lat, lon, width, height + "." + format].join("/");
      }

    },

    // Generates a random string
    _getUUID: function() {
      var S4 = function() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
      };
      return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    },

    /* Setters */
    _set: function(name, value) {

      var self = this;

      this.queue.add(function() {
        self.imageOptions[name] = value;
      });

      return this;

    },

    zoom: function(zoom) {
      return this._set("zoom", zoom);
    },

    bbox: function(bbox) {
      return this._set("bbox", bbox);
    },

    center: function(center) {
      this._set("bbox", null);
      return this._set("center", center);
    },

    format: function(format) {
      return this._set("format", _.include(this.supported_formats, format) ? format : this.defaults.format);
    },

    size: function(width, height) {
      return this._set("size", [width, height === undefined ? width : height]);
    },

    /* Methods */

    /* Image.into(HTMLImageElement)
       inserts the image in the HTMLImageElement specified */
    into: function(img) {

      var self = this;

      if (!(img instanceof HTMLImageElement)) {
        cartodb.log.error("img should be an image");
        return;
      }

      this.imageOptions.size = [img.width, img.height];

      this.queue.add(function(response) {
        img.src = self._getUrl();
      });

    },

    /* Image.getUrl(callback(err, url))
       gets the url for the image, err is null is there was no error */

    getUrl: function(callback) {

      var self = this;

      this.queue.add(function() {
        if (callback) {
          callback(self.error, self._getUrl()); 
        }
      });

    },

    /* Image.write(attributes)
       adds a img tag in the same place script is executed */

    write: function(attributes) {

      var self = this;

      this.imageOptions.attributes = attributes;

      if (attributes && attributes.src) {
        document.write('<img id="' + this.imageOptions.temp_id + '" src="'  + attributes.src + '" />');
      } else {
        document.write('<img id="' + this.imageOptions.temp_id + '" />');
      }

      this.queue.add(function() {

        var element = document.getElementById(self.imageOptions.temp_id);

        element.src = self._getUrl();
        element.removeAttribute("temp_id");

        var attributes = self.imageOptions.attributes;

        if (attributes && attributes.class) { element.setAttribute("class", attributes.class); }
        if (attributes && attributes.id)    { element.setAttribute("id", attributes.id); }

      });

      return this;
    }

  })

  cdb.Image = function(data, options) {

    if (!options) options = {};

    var image = new StaticImage();

    if (typeof data === 'string') {
      image.load(data, options);
    } else {
      image.loadLayerDefinition(data, options);
    }

    return image;

  };

})();

},{}],61:[function(require,module,exports){

(function() {

var Layers = cdb.vis.Layers;

/*
 *  if we are using http and the tiles of base map need to be fetched from
 *  https try to fix it
 */

var HTTPS_TO_HTTP = {
  'https://dnv9my2eseobd.cloudfront.net/': 'http://a.tiles.mapbox.com/',
  'https://maps.nlp.nokia.com/': 'http://maps.nlp.nokia.com/',
  'https://tile.stamen.com/': 'http://tile.stamen.com/',
  "https://{s}.maps.nlp.nokia.com/": "http://{s}.maps.nlp.nokia.com/",
  "https://cartocdn_{s}.global.ssl.fastly.net/": "http://{s}.api.cartocdn.com/",
  "https://cartodb-basemaps-{s}.global.ssl.fastly.net/": "http://{s}.basemaps.cartocdn.com/"
};

function transformToHTTP(tilesTemplate) {
  for(var url in HTTPS_TO_HTTP) {
    if(tilesTemplate.indexOf(url) !== -1) {
      return tilesTemplate.replace(url, HTTPS_TO_HTTP[url])
    }
  }
  return tilesTemplate;
}

function transformToHTTPS(tilesTemplate) {
  for(var url in HTTPS_TO_HTTP) {
    var httpsUrl = HTTPS_TO_HTTP[url];
    if(tilesTemplate.indexOf(httpsUrl) !== -1) {
      return tilesTemplate.replace(httpsUrl, url);
    }
  }
  return tilesTemplate;
}

Layers.register('tilejson', function(vis, data) {
  var url = data.tiles[0];
  if(vis.https === true) {
    url = transformToHTTPS(url);
  }
  else if(vis.https === false) { // Checking for an explicit false value. If it's undefined the url is left as is.
    url = transformToHTTP(url);
  }
  return new cdb.geo.TileLayer({
    urlTemplate: url
  });
});

Layers.register('tiled', function(vis, data) {
  var url = data.urlTemplate;
  if(vis.https === true) {
    url = transformToHTTPS(url);
  }
  else if(vis.https === false) { // Checking for an explicit false value. If it's undefined the url is left as is.
    url = transformToHTTP(url);
  }
  
  data.urlTemplate = url;
  return new cdb.geo.TileLayer(data);
});

Layers.register('wms', function(vis, data) {
  return new cdb.geo.WMSLayer(data);
});

Layers.register('gmapsbase', function(vis, data) {
  return new cdb.geo.GMapsBaseLayer(data);
});

Layers.register('plain', function(vis, data) {
  return new cdb.geo.PlainLayer(data);
});

Layers.register('background', function(vis, data) {
  return new cdb.geo.PlainLayer(data);
});


function normalizeOptions(vis, data) {
  if(data.infowindow && data.infowindow.fields) {
    if(data.interactivity) {
      if(data.interactivity.indexOf('cartodb_id') === -1) {
        data.interactivity = data.interactivity + ",cartodb_id";
      }
    } else {
      data.interactivity = 'cartodb_id';
    }
  }
  // if https is forced
  if(vis.https) {
    data.tiler_protocol = 'https';
    data.tiler_port = 443;
    data.sql_api_protocol = 'https';
    data.sql_api_port = 443;
  }
  data.cartodb_logo = vis.cartodb_logo == undefined ? data.cartodb_logo : vis.cartodb_logo;
}

var cartoLayer = function(vis, data) {
  normalizeOptions(vis, data);
  // if sublayers are included that means a layergroup should
  // be created
  if(data.sublayers) {
    data.type = 'layergroup';
    return new cdb.geo.CartoDBGroupLayer(data);
  }
  return new cdb.geo.CartoDBLayer(data);
};

Layers.register('cartodb', cartoLayer);
Layers.register('carto', cartoLayer);

Layers.register('layergroup', function(vis, data) {
  normalizeOptions(vis, data);
  return new cdb.geo.CartoDBGroupLayer(data);
});

Layers.register('namedmap', function(vis, data) {
  normalizeOptions(vis, data);
  return new cdb.geo.CartoDBNamedMapLayer(data);
});

Layers.register('torque', function(vis, data) {
  normalizeOptions(vis, data);
  // default is https
  if(vis.https) {
    if(data.sql_api_domain && data.sql_api_domain.indexOf('cartodb.com') !== -1) {
      data.sql_api_protocol = 'https';
      data.sql_api_port = 443;
      data.tiler_protocol = 'https';
      data.tiler_port = 443;
    }
  }
  data.cartodb_logo = vis.cartodb_logo == undefined ? data.cartodb_logo : vis.cartodb_logo;
  return new cdb.geo.TorqueLayer(data);
});

})();

},{}],62:[function(require,module,exports){
(function() {

cdb.vis.Overlay.register('logo', function(data, vis) {

});

cdb.vis.Overlay.register('slides_controller', function(data, vis) {

  var slides_controller = new cdb.geo.ui.SlidesController({
    transitions: data.transitions,
    visualization: vis
  });

  return slides_controller.render();

});

cdb.vis.Overlay.register('mobile', function(data, vis) {

  var template = cdb.core.Template.compile(
    data.template || '\
    <div class="backdrop"></div>\
    <div class="cartodb-header">\
      <div class="content">\
        <a href="#" class="fullscreen"></a>\
        <a href="#" class="toggle"></a>\
        </div>\
      </div>\
    </div>\
    <div class="aside">\
    <div class="layer-container">\
    <div class="scrollpane"><ul class="layers"></ul></div>\
    </div>\
    </div>\
    <div class="cartodb-attribution"></div>\
    <a href="#" class="cartodb-attribution-button"></a>\
    <div class="torque"></div>\
    ',
    data.templateType || 'mustache'
  );

  var mobile = new cdb.geo.ui.Mobile({
    template: template,
    mapView: vis.mapView,
    overlays: data.overlays,
    transitions: data.transitions,
    slides_data: data.slides,
    visualization: vis,
    layerView: data.layerView,
    visibility_options: data.options,
    torqueLayer: data.torqueLayer,
    map: data.map
  });

  return mobile.render();
});

cdb.vis.Overlay.register('image', function(data, vis) {

  var options = data.options;

  var template = cdb.core.Template.compile(
    data.template || '\
    <div class="content">\
    <div class="text widget_text">{{{ content }}}</div>\
    </div>',
    data.templateType || 'mustache'
  );

  var widget = new cdb.geo.ui.Image({
    model: new cdb.core.Model(options),
    template: template
  });

  return widget.render();

});

cdb.vis.Overlay.register('text', function(data, vis) {

  var options = data.options;

  var template = cdb.core.Template.compile(
    data.template || '\
    <div class="content">\
    <div class="text widget_text">{{{ text }}}</div>\
    </div>',
    data.templateType || 'mustache'
  );

  var widget = new cdb.geo.ui.Text({
    model: new cdb.core.Model(options),
    template: template,
    className: "cartodb-overlay overlay-text " + options.device
  });

  return widget.render();

});

cdb.vis.Overlay.register('annotation', function(data, vis) {

  var options = data.options;

  var template = cdb.core.Template.compile(
    data.template || '\
    <div class="content">\
    <div class="text widget_text">{{{ text }}}</div>\
    <div class="stick"><div class="ball"></div></div>\
    </div>',
    data.templateType || 'mustache'
  );

  var options = data.options;

  var widget = new cdb.geo.ui.Annotation({
    className: "cartodb-overlay overlay-annotation " + options.device,
    template: template,
    mapView: vis.mapView,
    device: options.device,
    text: options.extra.rendered_text,
    minZoom: options.style["min-zoom"],
    maxZoom: options.style["max-zoom"],
    latlng: options.extra.latlng,
    style: options.style
  });

  return widget.render();

});


cdb.vis.Overlay.register('zoom_info', function(data, vis) {
  //console.log("placeholder for the zoom_info overlay");
});

cdb.vis.Overlay.register('header', function(data, vis) {

  var options = data.options;

  var template = cdb.core.Template.compile(
    data.template || '\
    <div class="content">\
    <div class="title">{{{ title }}}</div>\
    <div class="description">{{{ description }}}</div>\
    </div>',
    data.templateType || 'mustache'
  );

  var widget = new cdb.geo.ui.Header({
    model: new cdb.core.Model(options),
    transitions: data.transitions,
    slides: vis.slides,
    template: template
  });

  return widget.render();

});

// map zoom control
cdb.vis.Overlay.register('zoom', function(data, vis) {

  if(!data.template) {
    vis.trigger('error', 'zoom template is empty')
    return;
  }

  var zoom = new cdb.geo.ui.Zoom({
    model: data.map,
    template: cdb.core.Template.compile(data.template)
  });

  return zoom.render();

});

// Tiles loader
cdb.vis.Overlay.register('loader', function(data) {

  var tilesLoader = new cdb.geo.ui.TilesLoader({
    template: cdb.core.Template.compile(data.template)
  });

  return tilesLoader.render();
});

cdb.vis.Overlay.register('time_slider', function(data, viz) {
  var slider = new cdb.geo.ui.TimeSlider(data);
  return slider.render();
});


// Header to show informtion (title and description)
cdb.vis.Overlay.register('_header', function(data, vis) {
  var MAX_SHORT_DESCRIPTION_LENGTH = 100;

  // Add the complete url for facebook and twitter
  if (location.href) {
    data.share_url = encodeURIComponent(location.href);
  } else {
    data.share_url = data.url;
  }

  var template = cdb.core.Template.compile(
    data.template || "\
      {{#title}}\
        <h1>\
          {{#url}}\
            <a href='#' onmousedown=\"window.open('{{url}}')\">{{title}}</a>\
          {{/url}}\
          {{^url}}\
            {{title}}\
          {{/url}}\
        </h1>\
      {{/title}}\
      {{#description}}<p>{{{description}}}</p>{{/description}}\
      {{#mobile_shareable}}\
        <div class='social'>\
          <a class='facebook' target='_blank'\
            href='http://www.facebook.com/sharer.php?u={{share_url}}&text=Map of {{title}}: {{description}}'>F</a>\
          <a class='twitter' href='https://twitter.com/share?url={{share_url}}&text={{twitter_title}}'\
           target='_blank'>T</a>\
        </div>\
      {{/mobile_shareable}}\
    ",
    data.templateType || 'mustache'
  );

  function truncate(s, length) {
    return s.substr(0, length-1) + (s.length > length ? '…' : '');
  }

  var title       = data.map.get('title');
  var description = data.map.get('description');

  var facebook_title = title + ": " + description;
  var twitter_title;

  if (title && description) {
    twitter_title = truncate(title + ": " + description, 112) + " %23map "
  } else if (title) {
    twitter_title = truncate(title, 112) + " %23map"
  } else if (description){
    twitter_title = truncate(description, 112) + " %23map"
  } else {
    twitter_title = "%23map"
  }

  var shareable = (data.shareable == "false" || !data.shareable) ? null : data.shareable;
  var mobile_shareable = shareable;

  mobile_shareable = mobile_shareable && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

  var header = new cdb.geo.ui.Header({
    title: title,
    description: description,
    facebook_title: facebook_title,
    twitter_title: twitter_title,
    url: data.url,
    share_url: data.share_url,
    mobile_shareable: mobile_shareable,
    shareable: shareable && !mobile_shareable,
    template: template
  });

  return header.render();
});

// infowindow
cdb.vis.Overlay.register('infowindow', function(data, vis) {

  if (_.size(data.fields) == 0) {
    return null;
  }

  var infowindowModel = new cdb.geo.ui.InfowindowModel({
    template: data.template,
    template_type: data.templateType,
    alternative_names: data.alternative_names,
    fields: data.fields,
    template_name: data.template_name
  });

  var infowindow = new cdb.geo.ui.Infowindow({
     model: infowindowModel,
     mapView: vis.mapView,
     template: data.template
  });

  return infowindow;
});


// layer_selector
cdb.vis.Overlay.register('layer_selector', function(data, vis) {

  var options = data.options;
  //if (!options.display) return;

  var template = cdb.core.Template.compile(
    data.template || '\
      <a href="#/change-visibility" class="layers">Visible layers<div class="count"></div></a>\
      ',
    data.templateType || 'underscore'
  );

  var dropdown_template = cdb.core.Template.compile(
    data.template || '\
      <ul></ul><div class="tail"><span class="border"></span></div>\
      ',
    data.templateType || 'underscore'
  );

  var layerSelector = new cdb.geo.ui.LayerSelector({
    model: new cdb.core.Model(options),
    mapView: vis.mapView,
    template: template,
    dropdown_template: dropdown_template,
    layer_names: data.layer_names
  });

  var timeSlider = vis.timeSlider;
  if (timeSlider) {
    layerSelector.bind('change:visible', function(visible, order, layer) {
      if (layer.get('type') === 'torque') {
        timeSlider[visible ? 'show': 'hide']();
      }
    });
  }
  if (vis.legends) {

    layerSelector.bind('change:visible', function(visible, order, layer) {


      if (layer.get('type') === 'layergroup' || layer.get('type') === 'torque') {

        var legend = vis.legends && vis.legends.getLegendByIndex(order);

        if (legend) {
          legend[visible ? 'show': 'hide']();
        }

      }

    });
  }

  return layerSelector.render();

});

// fullscreen
cdb.vis.Overlay.register('fullscreen', function(data, vis) {

  var options = data.options;

  options.allowWheelOnFullscreen = false;

  var template = cdb.core.Template.compile(
    data.template || '<a href="{{ mapUrl }}" target="_blank"></a>',
    data.templateType || 'mustache'
  );

  var fullscreen = new cdb.ui.common.FullScreen({
    doc: "#map > div",
    model: new cdb.core.Model(options),
    mapView: vis.mapView,
    template: template
  });

  return fullscreen.render();

});

// share content
cdb.vis.Overlay.register('share', function(data, vis) {

  var options = data.options;

  var template = cdb.core.Template.compile(
    data.template || '<a href="#"></a>',
    data.templateType || 'mustache'
  );

  var widget = new cdb.geo.ui.Share({
    model: new cdb.core.Model(options),
    vis: vis,
    map: vis.map,
    template: template
  });

  widget.createDialog();

  return widget.render();

});

// search content
cdb.vis.Overlay.register('search', function(data, vis) {

  var template = cdb.core.Template.compile(
    data.template || '\
      <form>\
        <span class="loader"></span>\
        <input type="text" class="text" value="" />\
        <input type="submit" class="submit" value="" />\
      </form>\
    ',
    data.templateType || 'mustache'
  );

  var search = new cdb.geo.ui.Search(
    _.extend(data, {
      template: template,
      mapView: vis.mapView,
      model: vis.map
    })
  );

  return search.render();

});

// tooltip
cdb.vis.Overlay.register('tooltip', function(data, vis) {
  if (!data.layer && vis.getLayers().length <= 1) {
    throw new Error("layer is null");
  }
  data.layer = data.layer || vis.getLayers()[1];
  data.layer.setInteraction(true);
  data.mapView = vis.mapView;
  return new cdb.geo.ui.Tooltip(data);
});

cdb.vis.Overlay.register('infobox', function(data, vis) {
  var layer;
  var layers = vis.getLayers();
  if (!data.layer) {
    if(layers.length > 1) {
      layer = layers[1];
    }
    data.layer = layer;
  }
  if(!data.layer) {
    throw new Error("layer is null");
  }
  data.layer.setInteraction(true);
  var infobox = new cdb.geo.ui.InfoBox(data);
  return infobox;

});

})();

},{}],63:[function(require,module,exports){
(function() {

var _requestCache = {};

/**
 * defines the container for an overlay.
 * It places the overlay
 */
var Overlay = {

  _types: {},

  // register a type to be created
  register: function(type, creatorFn) {
    Overlay._types[type] = creatorFn;
  },

  // create a type given the data
  // raise an exception if the type does not exist
  create: function(type, vis, data) {
    var t = Overlay._types[type];

    if (!t) {
      cdb.log.error("Overlay: " + type + " does not exist");
      return;
    }

    data.options = typeof data.options === 'string' ? JSON.parse(data.options): data.options;
    data.options = data.options || {}
    var widget = t(data, vis);

    if (widget) {
      widget.type = type;
      return widget;
    }

    return false;
  }
};

cdb.vis.Overlay = Overlay;

cdb.vis.Overlays = Backbone.Collection.extend({
  comparator: function() {
  }
});

// layer factory
var Layers = {

  _types: {},

  register: function(type, creatorFn) {
    this._types[type] = creatorFn;
  },

  create: function(type, vis, data) {
    if (!type) {
      cdb.log.error("creating a layer without type");
      return null;
    }
    var t = this._types[type.toLowerCase()];

    var c = {};
    c.type = type;
    _.extend(c, data, data.options);
    return new t(vis, c);
  },

  moduleForLayer: function(type) {
    if (type.toLowerCase() === 'torque') {
      return 'torque';
    }
    return null;
  },

  modulesForLayers: function(layers) {
    var modules = _(layers).map(function(layer) {
      return Layers.moduleForLayer(layer.type || layer.kind);
    });
    return _.compact(_.uniq(modules));
  }

};

cdb.vis.Layers = Layers;

cartodb.moduleLoad = function(name, mod) {
  cartodb[name] = mod;
  cartodb.config.modules.add({
    name: name,
    mod: mod
  });
};

/**
 * visulization creation
 */
var Vis = cdb.core.View.extend({

  initialize: function() {
    _.bindAll(this, 'loadingTiles', 'loadTiles', '_onResize');

    this.https = false;
    this.overlays = [];
    this.moduleChecked = false;
    this.layersLoading = 0;

    if (this.options.mapView) {
      this.mapView = this.options.mapView;
      this.map = this.mapView.map;
    }

    // recalculate map position on orientation change
    if (!window.addEventListener) {
      window.attachEvent('orientationchange', this.doOnOrientationChange, this);
    } else {
      window.addEventListener('orientationchange', _.bind(this.doOnOrientationChange, this));
    }

  },

  doOnOrientationChange: function() {
    //this.setMapPosition();
  },

  /**
   * check if all the modules needed to create layers are loaded
   */
  checkModules: function(layers) {
    var mods = Layers.modulesForLayers(layers);
    return _.every(_.map(mods, function(m) { return cartodb[m] !== undefined; }));
  },

  loadModules: function(layers, done) {
    var self = this;
    var mods = Layers.modulesForLayers(layers);
    for(var i = 0; i < mods.length; ++i) {
      Loader.loadModule(mods[i]);
    }
    function loaded () {
      if (self.checkModules(layers)) {
        cdb.config.unbind('moduleLoaded', loaded);
        done();
      }
    }

    cdb.config.bind('moduleLoaded', loaded);
    _.defer(loaded);
  },

  _addLegends: function(legends) {
    if (this.legends) {
      this.legends.remove();
    }

    this.legends = new cdb.geo.ui.StackedLegend({
      legends: legends
    });

    if (!this.mobile_enabled) {
      this.mapView.addOverlay(this.legends);
    }
  },

  addLegends: function(layers) {
    this._addLegends(this.createLegendView(layers));
  },

  _setLayerOptions: function(options) {

    var layers = [];

    // flatten layers (except baselayer)
    var layers = _.map(this.getLayers().slice(1), function(layer) {
      if (layer.getSubLayers) {
        return layer.getSubLayers();
      }
      return layer;
    });

    layers = _.flatten(layers);

    for (i = 0; i < Math.min(options.sublayer_options.length, layers.length); ++i) {

      var o = options.sublayer_options[i];
      var subLayer = layers[i];
      var legend = this.legends && this.legends.getLegendByIndex(i);

      if (legend) {
        legend[o.visible ? 'show': 'hide']();
      }

      // HACK
      if(subLayer.model && subLayer.model.get('type') === 'torque') {
        if (o.visible === false) {
          subLayer.model.set('visible', false);
          if (this.timeSlider) {
            this.timeSlider.hide();
          }
        }
      }
    }
  },

  _addOverlays: function(overlays, data, options) {

    overlays = overlays.toJSON();
    // Sort the overlays by its internal order
    overlays = _.sortBy(overlays, function(overlay) {
      return overlay.order === null ? Number.MAX_VALUE: overlay.order;
    });

    // clean current overlays
    while (this.overlays.length !== 0) {
      this.overlays.pop().clean();
    }

    this._createOverlays(overlays, data, options);
  },

  addTimeSlider: function(torqueLayer) {
    // if a timeslides already exists don't create it again
    if (torqueLayer && (torqueLayer.options.steps > 1) && !this.timeSlider) {
      var self = this;
      // dont use add overlay since this overlay is managed by torque layer
      var timeSlider = Overlay.create('time_slider', this, { layer: torqueLayer });
      this.mapView.addOverlay(timeSlider);
      this.timeSlider = timeSlider;
      // remove when layer is done
      torqueLayer.bind('remove', function _remove() {
        self.timeSlider = null;
        timeSlider.remove();
        torqueLayer.unbind('remove', _remove);
      });
    }
  },

  _setupSublayers: function(layers, options) {

    options.sublayer_options = [];

    _.each(layers.slice(1), function(lyr) {

      if (lyr.type === 'layergroup') {
        _.each(lyr.options.layer_definition.layers, function(l) {
          options.sublayer_options.push({ visible: ( l.visible !== undefined ? l.visible : true ) })
        });
      } else if (lyr.type === 'namedmap') {
        _.each(lyr.options.named_map.layers, function(l) {
          options.sublayer_options.push({ visible: ( l.visible !== undefined ? l.visible : true ) })
        });
      } else if (lyr.type === 'torque') {
        options.sublayer_options.push({ visible: ( lyr.options.visible !== undefined ? lyr.options.visible : true ) })
      }

    });

  },

  load: function(data, options) {
    var self = this;

    if (typeof(data) === 'string') {

      var url = data;

      cdb.core.Loader.get(url, function(data) {
        if (data) {
          self.load(data, options);
        } else {
          self.throwError('error fetching viz.json file');
        }
      });

      return this;

    }

    // if the viz.json contains slides, discard the main viz.json and use the slides
    var slides = data.slides;
    if (slides && slides.length > 0) {
      data = slides[0]
      data.slides = slides.slice(1);
    }

    // load modules needed for layers
    var layers = data.layers;

    // check if there are slides and check all the layers
    if (data.slides && data.slides.length > 0) {
      layers = layers.concat(_.flatten(data.slides.map(function(s) { return s.layers })));
    }

    if (!this.checkModules(layers)) {

      if (this.moduleChecked) {

        self.throwError("modules couldn't be loaded");
        return this;

      }

      this.moduleChecked = true;


      this.loadModules(layers, function() {
        self.load(data, options);
      });

      return this;

    }

    // configure the vis in http or https
    if (window && window.location.protocol && window.location.protocol === 'https:') {
      this.https = true;
    }

    if (data.https) {
      this.https = data.https;
    }

    options = options || {};

    this._applyOptions(data, options);

    // to know if the logo is enabled search in the overlays and see if logo overlay is included and is shown
    var has_logo_overlay = !!_.find(data.overlays, function(o) { return o.type === 'logo' && o.options.display; });

    this.cartodb_logo = (options.cartodb_logo !== undefined) ? options.cartodb_logo: has_logo_overlay;

    if (this.mobile) this.cartodb_logo = false;
    else if (!has_logo_overlay && options.cartodb_logo === undefined) this.cartodb_logo = true; // We set the logo by default

    var scrollwheel       = (options.scrollwheel === undefined)  ? data.scrollwheel : options.scrollwheel;
    var slides_controller = (options.slides_controller === undefined)  ? data.slides_controller : options.slides_controller;

    // map
    data.maxZoom || (data.maxZoom = 20);
    data.minZoom || (data.minZoom = 0);

    //Force using GMaps ?
    if ( (this.gmaps_base_type) && (data.map_provider === "leaflet") ) {

      //Check if base_type is correct
      var typesAllowed = ['roadmap', 'gray_roadmap', 'dark_roadmap', 'hybrid', 'satellite', 'terrain'];
      if (_.contains(typesAllowed, this.gmaps_base_type)) {
        if (data.layers) {
          data.layers[0].options.type = 'GMapsBase';
          data.layers[0].options.base_type = this.gmaps_base_type;
          data.layers[0].options.name = this.gmaps_base_type;

          if (this.gmaps_style) {
            data.layers[0].options.style = typeof this.gmaps_style === 'string' ? JSON.parse(this.gmaps_style): this.gmaps_style;
          }

          data.map_provider = 'googlemaps';
          data.layers[0].options.attribution = ''; //GMaps has its own attribution
        } else {
          cdb.log.error('No base map loaded. Using Leaflet.');
        }
      } else {
        cdb.log.error('GMaps base_type "' + this.gmaps_base_type + ' is not supported. Using leaflet.');
      }
    }

    var mapConfig = {
      title: data.title,
      description: data.description,
      maxZoom: data.maxZoom,
      minZoom: data.minZoom,
      legends: data.legends,
      scrollwheel: scrollwheel,
      provider: data.map_provider
    };

    // if the boundaries are defined, we add them to the map
    if (data.bounding_box_sw && data.bounding_box_ne) {

      mapConfig.bounding_box_sw = data.bounding_box_sw;
      mapConfig.bounding_box_ne = data.bounding_box_ne;

    }

    if (data.bounds) {

      mapConfig.view_bounds_sw = data.bounds[0];
      mapConfig.view_bounds_ne = data.bounds[1];

    } else {
      var center = data.center;

      if (typeof(center) === "string") {
        center = $.parseJSON(center);
      }

      mapConfig.center = center || [0, 0];
      mapConfig.zoom = data.zoom === undefined ? 4: data.zoom;
    }

    var map = new cdb.geo.Map(mapConfig);
    this.map = map;
    this.overlayModels = new Backbone.Collection();

    this.updated_at = data.updated_at || new Date().getTime();

    // If a CartoDB embed map is hidden by default, its
    // height is 0 and it will need to recalculate its size
    // and re-center again.
    // We will wait until it is resized and then apply
    // the center provided in the parameters and the
    // correct size.
    var map_h = this.$el.outerHeight();

    if (map_h === 0) {
      this.mapConfig = mapConfig;
      $(window).bind('resize', this._onResize);
    }

    var div = $('<div>').css({
      position: 'relative',
      width: '100%',
      height: '100%'
    });

    this.container = div;

    // Another div to prevent leaflet grabbing the div
    var div_hack = $('<div>')
      .addClass("cartodb-map-wrapper")
      .css({
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%'
      });

    div.append(div_hack);

    this.$el.append(div);

    // Create the map
    var mapView  = new cdb.geo.MapView.create(div_hack, map);

    this.mapView = mapView;

    if (options.legends || (options.legends === undefined && this.map.get("legends") !== false)) {
      map.layers.bind('reset', this.addLegends, this);
    }

    this.overlayModels.bind('reset', function(overlays) {
      this._addOverlays(overlays, data, options);
      this._addMobile(data, options);
    }, this);

    this.mapView.bind('newLayerView', this._addLoading, this);

    if (options.time_slider) {
      this.mapView.bind('newLayerView', this._addTimeSlider, this);
    }

    if (this.infowindow) {
      this.mapView.bind('newLayerView', this.addInfowindow, this);
    }

    if (this.tooltip) {
      this.mapView.bind('newLayerView', this.addTooltip, this);
    }

    this.map.layers.reset(_.map(data.layers, function(layerData) {
      return Layers.create(layerData.type || layerData.kind, self, layerData);
    }));

    this.overlayModels.reset(data.overlays);

    // if there are no sublayer_options fill it
    if (!options.sublayer_options) {
      this._setupSublayers(data.layers, options);
    }

    this._setLayerOptions(options);

    if (data.slides) {

      this.map.disableKeyboard();

      function odysseyLoaded() {
        self._createSlides([data].concat(data.slides));
      };

      if (cartodb.odyssey === undefined) {
        cdb.config.bind('moduleLoaded:odyssey', odysseyLoaded);
        Loader.loadModule('odyssey');
      } else {
        odysseyLoaded();
      }

    }

    _.defer(function() {
      self.trigger('done', self, self.getLayers());
    })

    return this;

  },

  _addTimeSlider: function() {
    var self = this;
    var torque = _(this.getLayers()).find(function(layer) {
      return layer.model.get('type') === 'torque' && layer.model.get('visible');
    });
    if (torque) {
      this.torqueLayer = torque;
      // send step events from torque layer
      this.torqueLayer.bind('change:time', function(s) {
        this.trigger('change:step', this.torqueLayer, this.torqueLayer.getStep());
      }, this);
      if (!this.mobile_enabled && this.torqueLayer) {
        this.addTimeSlider(this.torqueLayer);
      }
    }
  },

  // sets the animation step if there is an animation
  // returns true if succed
  setAnimationStep: function(s, opt) {
    if (this.torqueLayer) {
      this.torqueLayer.setStep(s, opt);
      return true;
    }
    return false;
  },

  _createSlides: function(slides) {

      function BackboneActions(model) {
        var actions = {
          set: function() {
            var args = arguments;
            return O.Action({
              enter: function() {
                model.set.apply(model, args);
              }
            });
          },

          reset: function() {
            var args = arguments;
            return O.Action({
              enter: function() {
                model.reset.apply(model, args);
              }
            });
          }
        };
        return actions;
      }

      function SetStepAction(vis, step) {
        return O.Action(function() {
          vis.setAnimationStep(step);
        });
      }

      function AnimationTrigger(vis, step) {
        var t = O.Trigger();
        vis.on('change:step', function (layer, currentStep) {
          if (currentStep === step) {
            t.trigger();
          }
        });
        return t;
      }

      function PrevTrigger(seq, step) {
        var t = O.Trigger();
        var c = PrevTrigger._callbacks;
        if (!c) {
          c = PrevTrigger._callbacks = []
          O.Keys().left().then(function() {
            for (var i = 0; i < c.length; ++i) {
              if (c[i] === seq.current()) {
                t.trigger();
                return;
              }
            }
          });
        }
        c.push(step);
        return t;
      }

      function NextTrigger(seq, step) {
        var t = O.Trigger();
        var c = NextTrigger._callbacks;
        if (!c) {
          c = NextTrigger._callbacks = []
          O.Keys().right().then(function() {
            for (var i = 0; i < c.length; ++i) {
              if (c[i] === seq.current()) {
                t.trigger();
                return;
              }
            }
          });
        }
        c.push(step);
        return t;
      }

      function WaitAction(seq, ms) {
        return O.Step(O.Sleep(ms), O.Action(function() {
          seq.next();
        }));
      }

      var self = this;

      var seq = this.sequence = O.Sequential();
      this.slides = O.Story();

      // transition - debug, remove
      //O.Keys().left().then(seq.prev, seq);
      //O.Keys().right().then(seq.next, seq);

      this.map.actions = BackboneActions(this.map);
      this.map.layers.actions = BackboneActions(this.map.layers);
      this.overlayModels.actions = BackboneActions(this.overlayModels)

      function goTo(seq, i) {
        return function() {
          seq.current(i);
        }
      }

      for (var i = 0; i < slides.length; ++i) {
        var slide = slides[i];
        var states = [];

        var mapChanges = O.Step(
          // map movement
          this.map.actions.set({
            'center': typeof slide.center === 'string' ? JSON.parse(slide.center): slide.center,
            'zoom': slide.zoom
          }),
          // wait a little bit
          O.Sleep(350),
          // layer change
          this.map.layers.actions.reset(_.map(slide.layers, function(layerData) {
            return Layers.create(layerData.type || layerData.kind, self, layerData);
          }))
        );

        states.push(mapChanges);

        // overlays
        states.push(this.overlayModels.actions.reset(slide.overlays));

        if (slide.transition_options) {
          var to = slide.transition_options;
          if (to.transition_trigger === 'time') {
            states.push(WaitAction(seq, to.time * 1000));
          } else { //default is click
            NextTrigger(seq, i).then(seq.next, seq);
            PrevTrigger(seq, i).then(seq.prev, seq);
          }
        }

        this.slides.addState(
          seq.step(i),
          O.Parallel.apply(window, states)
        );

      }
      this.slides.go(0);
  },

  _createOverlays: function(overlays, vis_data, options) {

    // if there's no header overlay, we need to explicitly create the slide controller
    if ((options["slides_controller"] || options["slides_controller"] === undefined) && !this.mobile_enabled && !_.find(overlays, function(o) { return o.type === 'header' && o.options.display; })) {
      this._addSlideController(vis_data);
    }

    _(overlays).each(function(data) {
      var type = data.type;

      // We don't render certain overlays if we are in mobile
      if (this.mobile_enabled && (type === "zoom" || type === "header" || type === "loader")) return;

      // IE<10 doesn't support the Fullscreen API
      if (type === 'fullscreen' && cdb.core.util.browser.ie && cdb.core.util.browser.ie.version <= 10) return;

      // Decide to create or not the custom overlays
      if (type === 'image' || type === 'text' || type === 'annotation') {
        var isDevice = data.options.device == "mobile" ? true : false;
        if (this.mobile !== isDevice) return;
        if (!options[type] && options[type] !== undefined) {
          return;
        }
      }

      // We add the header overlay
      if (type === 'header') {
        var overlay = this._addHeader(data, vis_data);
      } else {
        var overlay = this.addOverlay(data);
      }

      // We show/hide the overlays
      if (overlay && (type in options) && options[type] === false) overlay.hide();

      var opt = data.options;

      if (!this.mobile_enabled) {

        if (type == 'share' && options["shareable"]  || type == 'share' && overlay.model.get("display") && options["shareable"] == undefined) overlay.show();
        if (type == 'layer_selector' && options[type] || type == 'layer_selector' && overlay.model.get("display") && options[type] == undefined) overlay.show();
        if (type == 'fullscreen' && options[type] || type == 'fullscreen' && overlay.model.get("display") && options[type] == undefined) overlay.show();
        if (type == 'search' && options[type] || type == 'search' && opt.display && options[type] == undefined) overlay.show();

        if (type === 'header') {

          var m = overlay.model;

          if (options.title !== undefined) {
            m.set("show_title", options.title);
          }

          if (options.description !== undefined) {
            m.set("show_description", options.description);
          }

          if (m.get('show_title') || m.get('show_description')) {
            $(".cartodb-map-wrapper").addClass("with_header");
          }

          overlay.render();
        }
      }


    }, this);

  },

  _addSlideController: function(data) {

    if (data.slides && data.slides.length > 0) {

      var transitions = [data.transition_options].concat(_.pluck(data.slides, "transition_options"));

      return this.addOverlay({
        type: 'slides_controller',
        transitions: transitions
      });
    }

  },

  _addHeader: function(data, vis_data) {

    var transitions = [vis_data.transition_options].concat(_.pluck(vis_data.slides, "transition_options"))

    return this.addOverlay({
      type: 'header',
      options: data.options,
      transitions: transitions
    });

  },

  _addMobile: function(data, options) {

    var layers;
    var layer = data.layers[1];

    if (this.mobile_enabled) {

      if (options && options.legends === undefined) {
        options.legends = this.legends ? true : false;
      }

      if (layer.options && layer.options.layer_definition) {
        layers = layer.options.layer_definition.layers;
      } else if (layer.options && layer.options.named_map && layer.options.named_map.layers) {
        layers = layer.options.named_map.layers;
      }

      var transitions = [data.transition_options].concat(_.pluck(data.slides, "transition_options"));

      this.mobileOverlay = this.addOverlay({
        type: 'mobile',
        layers: layers,
        slides: data.slides,
        transitions:transitions,
        overlays: data.overlays,
        options: options,
        torqueLayer: this.torqueLayer
      });
    }
  },

  _createLegendView: function(layer, layerView) {
    if (layer.legend) {
      layer.legend.data = layer.legend.items;
      var legend = layer.legend;

      if ((legend.items && legend.items.length) || legend.template) {
        var legendAttrs = _.extend(layer.legend, {
          visible: layer.visible
        });
        var legendModel = new cdb.geo.ui.LegendModel(legendAttrs);
        var legendView = new cdb.geo.ui.Legend({ model: legendModel });
        layerView.bind('change:visibility', function(layer, hidden) {
          legendView[hidden ? 'hide': 'show']();
        });
        layerView.legend = legendModel;
        return legendView;
      }
    }
    return null;
  },

  createLegendView: function(layers) {
    var legends = [];
    var self = this;
    for (var i = layers.length - 1; i >= 0; --i) {
      var cid = layers.at(i).cid;
      var layer = layers.at(i).attributes;
      if (layer.visible) {
        var layerView = this.mapView.getLayerByCid(cid);
        if (layerView) {
          var layerView = this.mapView.getLayerByCid(cid);
          legends.push(this._createLayerLegendView(layer, layerView));
        }
      }
    }
    return _.flatten(legends);
  },

  _createLayerLegendView: function(layer, layerView) {
    var self = this;
    var legends = [];
    if (layer.options && layer.options.layer_definition) {
      var sublayers = layer.options.layer_definition.layers;
      _(sublayers).each(function(sub, i) {
        legends.push(self._createLegendView(sub, layerView.getSubLayer(i)));
      });
    } else if(layer.options && layer.options.named_map && layer.options.named_map.layers) {
      var sublayers = layer.options.named_map.layers;
      _(sublayers).each(function(sub, i) {
        legends.push(self._createLegendView(sub, layerView.getSubLayer(i)));
      });
    } else {
      legends.push(this._createLegendView(layer, layerView))
    }
    return _.compact(legends).reverse();
  },

  addOverlay: function(overlay) {

    overlay.map = this.map;

    var v = Overlay.create(overlay.type, this, overlay);

    if (v) {
      // Save tiles loader view for later
      if (overlay.type == "loader") {
        this.loader = v;
      }

      this.mapView.addOverlay(v);

      this.overlays.push(v);

      v.bind('clean', function() {
        for(var i in this.overlays) {
          var o = this.overlays[i];
          if (v.cid === o.cid) {
            this.overlays.splice(i, 1)
            return;
          }
        }
      }, this);
    }
    return v;
  },

  // change vizjson based on options
  _applyOptions: function(vizjson, opt) {
    opt = opt || {};
    opt = _.defaults(opt, {
      tiles_loader: true,
      loaderControl: true,
      infowindow: true,
      tooltip: true,
      time_slider: true
    });
    vizjson.overlays = vizjson.overlays || [];
    vizjson.layers = vizjson.layers || [];

    function search_overlay(name) {
      if (!vizjson.overlays) return null;
      for(var i = 0; i < vizjson.overlays.length; ++i) {
        if (vizjson.overlays[i].type === name) {
          return vizjson.overlays[i];
        }
      }
    }

    function remove_overlay(name) {
      if (!vizjson.overlays) return;
      for(var i = 0; i < vizjson.overlays.length; ++i) {
        if (vizjson.overlays[i].type === name) {
          vizjson.overlays.splice(i, 1);
          return;
        }
      }
    }

    this.infowindow = opt.infowindow;
    this.tooltip    = opt.tooltip;

    if (opt.https) {
      this.https = true;
    }

    if (opt.gmaps_base_type) {
      this.gmaps_base_type = opt.gmaps_base_type;
    }

    if (opt.gmaps_style) {
      this.gmaps_style = opt.gmaps_style;
    }

    this.mobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    this.mobile_enabled = (opt.mobile_layout && this.mobile) || opt.force_mobile;

    if (opt.force_mobile === false || opt.force_mobile === "false") this.mobile_enabled = false;

    if (!opt.title) {
      vizjson.title = null;
    }

    if (!opt.description) {
      vizjson.description = null;
    }

    if (!opt.tiles_loader) {
      remove_overlay('loader');
    }

    if (!opt.loaderControl) {
      remove_overlay('loader');
    }

    if (opt.searchControl !== undefined) {
      opt.search = opt.searchControl;
    }

    if (!this.mobile_enabled && opt.search) {
      if (!search_overlay('search')) {
        vizjson.overlays.push({
           type: "search",
           order: 3
        });
      }
    }

    if ( (opt.title && vizjson.title) || (opt.description && vizjson.description) ) {

      if (!search_overlay('header')) {
        vizjson.overlays.unshift({
          type: "header",
          order: 1,
          shareable: opt.shareable ? true: false,
          url: vizjson.url,
          options: {
            extra: {
              title: vizjson.title,
              description: vizjson.description,
              show_title: opt.title,
              show_description: opt.description
            }
          }
        });
      }
    }


    if (opt.layer_selector) {
      if (!search_overlay('layer_selector')) {
        vizjson.overlays.push({
          type: "layer_selector"
        });
      }
    }

    if (opt.shareable && !this.mobile_enabled) {
      if (!search_overlay('share')) {
        vizjson.overlays.push({
          type: "share",
          order: 2,
          url: vizjson.url
        });
      }
    }

    // We remove certain overlays in mobile devices
    if (this.mobile_enabled) {
      remove_overlay('logo');
      remove_overlay('share');
    }

    if (this.mobile || ((opt.zoomControl !== undefined) && (!opt.zoomControl)) ){
      remove_overlay('zoom');
    }

    if (this.mobile || ((opt.search !== undefined) && (!opt.search)) ){
      remove_overlay('search');
    }

    // if bounds are present zoom and center will not taken into account
    var zoom = parseInt(opt.zoom);
    if (!isNaN(zoom)) {
      vizjson.zoom = zoom;
      vizjson.bounds = null;
    }

    // Center coordinates?
    var center_lat = parseFloat(opt.center_lat);
    var center_lon = parseFloat(opt.center_lon);
    if ( !isNaN(center_lat) && !isNaN(center_lon) ) {
      vizjson.center = [center_lat, center_lon];
      vizjson.bounds = null;
    }

    // Center object
    if (opt.center !== undefined) {
      vizjson.center = opt.center;
      vizjson.bounds = null;
    }

    // Bounds?
    var sw_lat = parseFloat(opt.sw_lat);
    var sw_lon = parseFloat(opt.sw_lon);
    var ne_lat = parseFloat(opt.ne_lat);
    var ne_lon = parseFloat(opt.ne_lon);

    if ( !isNaN(sw_lat) && !isNaN(sw_lon) && !isNaN(ne_lat) && !isNaN(ne_lon) ) {
      vizjson.bounds = [
        [ sw_lat, sw_lon ],
        [ ne_lat, ne_lon ]
      ];
    }

    if (vizjson.layers.length > 1) {
      var token = opt.auth_token;
      function _applyLayerOptions(layers) {
        for(var i = 1; i < layers.length; ++i) {
          var o = layers[i].options;
          o.no_cdn = opt.no_cdn;
          o.force_cors = opt.force_cors;
          if(token) {
            o.auth_token = token;
          }
        }
      }
      _applyLayerOptions(vizjson.layers);
      if (vizjson.slides) {
        for(var i = 0; i < vizjson.slides.length; ++i) {
          _applyLayerOptions(vizjson.slides[i].layers);
        }
      }
    }

  },

  // Set map top position taking into account header height
  setMapPosition: function() { },

  createLayer: function(layerData, opts) {
    var layerModel = Layers.create(layerData.type || layerData.kind, this, layerData);
    return this.mapView.createLayer(layerModel);
  },

  _getSqlApi: function(attrs) {
    attrs = attrs || {};
    var port = attrs.sql_api_port
    var domain = attrs.sql_api_domain + (port ? ':' + port: '')
    var protocol = attrs.sql_api_protocol;
    var version = 'v1';
    if (domain.indexOf('cartodb.com') !== -1) {
      protocol = 'http';
      domain = "cartodb.com";
      version = 'v2';
    }

    var sql = new cartodb.SQL({
      user: attrs.user_name,
      protocol: protocol,
      host: domain,
      version: version
    });

    return sql;
  },

  addTooltip: function(layerView) {
    if(!layerView || !layerView.containTooltip || !layerView.containTooltip()) {
      return;
    }
    for(var i = 0; i < layerView.getLayerCount(); ++i) {
      var t = layerView.getTooltipData(i);
      if (t) {
        if (!layerView.tooltip) {
          var tooltip = new cdb.geo.ui.Tooltip({
            mapView: this.mapView,
            layer: layerView,
            template: t.template,
            position: 'bottom|right',
            vertical_offset: 10,
            horizontal_offset: 4,
            fields: t.fields,
            omit_columns: ['cartodb_id']
          });
          layerView.tooltip = tooltip;
          this.mapView.addOverlay(tooltip);
          layerView.bind('remove', function() {
            this.tooltip.clean();
          });
        }
        layerView.setInteraction(i, true);
      }
    }

    if (layerView.tooltip) {
      layerView.bind("featureOver", function(e, latlng, pos, data, layer) {
        var t = layerView.getTooltipData(layer);
        if (t) {
          layerView.tooltip.setTemplate(t.template);
          layerView.tooltip.setFields(t.fields);
          layerView.tooltip.setAlternativeNames(t.alternative_names);
          layerView.tooltip.enable();
        } else {
          layerView.tooltip.disable();
        }
      });
    }
  },

  addInfowindow: function(layerView) {

    if(!layerView.containInfowindow || !layerView.containInfowindow()) {
      return;
    }

    var mapView = this.mapView;
    var eventType = 'featureClick';
    var infowindow = null;

    // activate interactivity for layers with infowindows
    for(var i = 0; i < layerView.getLayerCount(); ++i) {

      if (layerView.getInfowindowData(i)) {
        if(!infowindow) {
          infowindow = Overlay.create('infowindow', this, layerView.getInfowindowData(i), true);
          mapView.addInfowindow(infowindow);
        }
        layerView.setInteraction(i, true);
      }
    }

    if(!infowindow) {
      return;
    }

    infowindow.bind('close', function() {
      // when infowindow is closed remove all the filters
      // for tooltips
      for(var i = 0; i < layerView.getLayerCount(); ++i) {
        var t = layerView.tooltip;
        if (t) {
          t.setFilter(null);
        }
      }
    })

    // if the layer has no infowindow just pass the interaction
    // data to the infowindow
    layerView.bind(eventType, function(e, latlng, pos, data, layer) {

        var infowindowFields = layerView.getInfowindowData(layer);
        if (!infowindowFields) return;
        var fields = _.pluck(infowindowFields.fields, 'name');
        var cartodb_id = data.cartodb_id;

        layerView.fetchAttributes(layer, cartodb_id, fields, function(attributes) {

          // Old viz.json doesn't contain width and maxHeight properties
          // and we have to get the default values if there are not defined.
          var extra = _.defaults(
            {
              offset: infowindowFields.offset,
              width: infowindowFields.width,
              maxHeight: infowindowFields.maxHeight
            },
            cdb.geo.ui.InfowindowModel.prototype.defaults
          );

          infowindow.model.set({
            'fields': infowindowFields.fields,
            'template': infowindowFields.template,
            'template_type': infowindowFields.template_type,
            'alternative_names': infowindowFields.alternative_names,
            'sanitizeTemplate': infowindowFields.sanitizeTemplate,
            'offset': extra.offset,
            'width': extra.width,
            'maxHeight': extra.maxHeight
          });

          if (attributes) {
            infowindow.model.updateContent(attributes);
            infowindow.adjustPan();
          } else {
            infowindow.setError();
          }
        });

        // Show infowindow with loading state
        infowindow
          .setLatLng(latlng)
          .setLoading()
          .showInfowindow();

        if (layerView.tooltip) {
          layerView.tooltip.setFilter(function(feature) {
            return feature.cartodb_id !== cartodb_id;
          }).hide();
        }
    });

    var hovers = [];

    layerView.bind('mouseover', function() {
      mapView.setCursor('pointer');
    });

    layerView.bind('mouseout', function(m, layer) {
      mapView.setCursor('auto');
    });

    layerView.infowindow = infowindow.model;
  },

  _addLoading: function (layerView) {
    if (layerView) {
      var self = this;

      var loadingTiles = function() {
        self.loadingTiles();
      };

      var loadTiles = function() {
        self.loadTiles();
      };

      layerView.bind('loading', loadingTiles);
      layerView.bind('load',    loadTiles);
    }
  },


  loadingTiles: function() {

    if (this.mobileOverlay) {
      this.mobileOverlay.loadingTiles();
    }

    if (this.loader) {
      this.loader.show()
    }
    if(this.layersLoading === 0) {
        this.trigger('loading');
    }
    this.layersLoading++;
  },

  loadTiles: function() {

    if (this.mobileOverlay) {
      this.mobileOverlay.loadTiles();
    }

    if (this.loader) {
      this.loader.hide();
    }
    this.layersLoading--;
    // check less than 0 because loading event sometimes is
    // thrown before visualization creation
    if(this.layersLoading <= 0) {
      this.layersLoading = 0;
      this.trigger('load');
    }
  },

  throwError: function(msg, lyr) {
    cdb.log.error(msg);
    var self = this;
    _.defer(function() {
      self.trigger('error', msg, lyr);
    });
  },

  error: function(fn) {
    return this.bind('error', fn);
  },

  done: function(fn) {
    return this.bind('done', fn);
  },

  // public methods
  //

  // get the native map used behind the scenes
  getNativeMap: function() {
    return this.mapView.getNativeMap();
  },

  // returns an array of layers
  getLayers: function() {
    var self = this;
    return _.compact(this.map.layers.map(function(layer) {
      return self.mapView.getLayerByCid(layer.cid);
    }));
  },

  getOverlays: function() {
    return this.overlays;
  },

  getOverlay: function(type) {
    return _(this.overlays).find(function(v) {
      return v.type == type;
    });
  },

  getOverlaysByType: function(type) {
    return _(this.overlays).filter(function(v) {
      return v.type == type;
    });
  },

  _onResize: function() {

    $(window).unbind('resize', this._onResize);

    var self = this;

    self.mapView.invalidateSize();

    // This timeout is necessary due to GMaps needs time
    // to load tiles and recalculate its bounds :S
    setTimeout(function() {

      var c = self.mapConfig;

      if (c.view_bounds_sw) {

        self.mapView.map.setBounds([
          c.view_bounds_sw,
          c.view_bounds_ne
        ]);

      } else {

        self.mapView.map.set({
          center: c.center,
          zoom: c.zoom
        });

      }
    }, 150);
  }

}, {

  /**
   * adds an infowindow to the map controlled by layer events.
   * it enables interaction and overrides the layer interacivity
   * ``fields`` array of column names
   * ``map`` native map object, leaflet of gmaps
   * ``layer`` cartodb layer (or sublayer)
   */
  addInfowindow: function(map, layer, fields, opts) {
    var options = _.defaults(opts || {}, {
      infowindowTemplate: cdb.vis.INFOWINDOW_TEMPLATE.light,
      templateType: 'mustache',
      triggerEvent: 'featureClick',
      templateName: 'light',
      extraFields: [],
      cursorInteraction: true
    });

    if(!map) throw new Error('map is not valid');
    if(!layer) throw new Error('layer is not valid');
    if(!fields && fields.length === undefined ) throw new Error('fields should be a list of strings');

    var f = [];
    fields = fields.concat(options.extraFields);
    for(var i = 0; i < fields.length; ++i) {
      f.push({ name: fields, order: i});
    }

    var infowindowModel = new cdb.geo.ui.InfowindowModel({
      fields: f,
      template_name: options.templateName
    });

    var infowindow = new cdb.geo.ui.Infowindow({
       model: infowindowModel,
       mapView: map.viz.mapView,
       template: new cdb.core.Template({
         template: options.infowindowTemplate,
         type: options.templateType
       }).asFunction()
    });

    map.viz.mapView.addInfowindow(infowindow);
    // try to change interactivity, it the layer is a named map
    // it's inmutable so it'a assumed the interactivity already has
    // the fields it needs
    try {
      layer.setInteractivity(fields);
    } catch(e) {
    }
    layer.setInteraction(true);

    layer.bind(options.triggerEvent, function(e, latlng, pos, data, layer) {
      var render_fields = [];
      var d;
      for (var f = 0; f < fields.length; ++f) {
        var field = fields[f];
        if (d = data[field]) {
          render_fields.push({
            title: field,
            value: d,
            index: 0
          });
        }
      }

      infowindow.model.set({
        content:  {
          fields: render_fields,
          data: data
        }
      });

      infowindow
        .setLatLng(latlng)
        .showInfowindow();
      infowindow.adjustPan();
    }, infowindow);

    // remove the callback on clean
    infowindow.bind('clean', function() {
      layer.unbind(options.triggerEvent, null, infowindow);
    });

    if(options.cursorInteraction) {
      cdb.vis.Vis.addCursorInteraction(map, layer);
    }

    return infowindow;

  },

  addCursorInteraction: function(map, layer) {
    var mapView = map.viz.mapView;
    layer.bind('mouseover', function() {
      mapView.setCursor('pointer');
    });

    layer.bind('mouseout', function(m, layer) {
      mapView.setCursor('auto');
    });
  },

  removeCursorInteraction: function(map, layer) {
    var mapView = map.viz.mapView;
    layer.unbind(null, null, mapView);
  }

});

cdb.vis.INFOWINDOW_TEMPLATE = {
  light: [
    '<div class="cartodb-popup v2">',
    '<a href="#close" class="cartodb-popup-close-button close">x</a>',
    '<div class="cartodb-popup-content-wrapper">',
      '<div class="cartodb-popup-content">',
        '{{#content.fields}}',
          '{{#title}}<h4>{{title}}</h4>{{/title}}',
          '{{#value}}',
            '<p {{#type}}class="{{ type }}"{{/type}}>{{{ value }}}</p>',
          '{{/value}}',
          '{{^value}}',
            '<p class="empty">null</p>',
          '{{/value}}',
        '{{/content.fields}}',
      '</div>',
    '</div>',
    '<div class="cartodb-popup-tip-container"></div>',
  '</div>'
  ].join('')
};

cdb.vis.Vis = Vis;

})();

},{}],"cartodb":[function(require,module,exports){
// entry point
;
(function () {

    var root = this;

    var cdb = root.cdb = {};

    cdb.VERSION = "3.15.7";
    cdb.DEBUG = false;

    cdb.CARTOCSS_VERSIONS = {
        '2.0.0': '',
        '2.1.0': ''
    };

    cdb.CARTOCSS_DEFAULT_VERSION = '2.1.1';

    root.cdb.config = {};
    root.cdb.core = {};
    root.cdb.image = {};
    root.cdb.geo = {};
    root.cdb.geo.ui = {};
    root.cdb.geo.geocoder = {};
    root.cdb.ui = {};
    root.cdb.ui.common = {};
    root.cdb.vis = {};
    root.cdb.decorators = {};

    /**
     * global variables
     */
    root.JST = root.JST || {};
    root.cartodb = cdb;

    cdb.files = [

        //"../vendor/jquery.min.js",
        //"../vendor/underscore-min.js",
        //"../vendor/json2.js",
        //"../vendor/backbone.js",
        //"../vendor/mustache.js",
        //
        //"../vendor/leaflet.js",
        //"../vendor/wax.cartodb.js",
        //"../vendor/GeoJSON.js", //geojson gmaps lib
        //
        //"../vendor/jscrollpane.js",
        //"../vendor/mousewheel.js",
        //"../vendor/mwheelIntent.js",
        //"../vendor/spin.js",
        //"../vendor/lzma.js",
        //"../vendor/html-css-sanitizer-bundle.js",

        require('./core/sanitize'),
        require('./core/decorator'),
        require('./core/config'),
        require('./core/log'),
        require('./core/profiler'),
        require('./core/template'),
        require('./core/model'),
        require('./core/view'),
        require('./core/loader'),
        require('./core/util'),

        require('./geo/geocoder'),
        require('./geo/geometry'),
        require('./geo/map'),
        require('./geo/ui/text'),
        require('./geo/ui/annotation'),
        require('./geo/ui/image'),
        require('./geo/ui/share'),
        require('./geo/ui/zoom'),
        require('./geo/ui/zoom_info'),
        require('./geo/ui/legend'),
        require('./geo/ui/switcher'),
        require('./geo/ui/infowindow'),
        require('./geo/ui/header'),
        require('./geo/ui/search'),
        require('./geo/ui/layer_selector'),
        require('./geo/ui/slides_controller'),
        require('./geo/ui/mobile'),
        require('./geo/ui/tiles_loader'),
        require('./geo/ui/infobox'),
        require('./geo/ui/tooltip'),
        require('./geo/ui/fullscreen'),

        require('./geo/sublayer'),
        require('./geo/layer_definition'),
        require('./geo/common'),

        require('./geo/leaflet/leaflet_base'),
        require('./geo/leaflet/leaflet_plainlayer'),
        require('./geo/leaflet/leaflet_tiledlayer'),
        require('./geo/leaflet/leaflet_gmaps_tiledlayer'),
        require('./geo/leaflet/leaflet_wmslayer'),
        require('./geo/leaflet/leaflet_cartodb_layergroup'),
        require('./geo/leaflet/leaflet_cartodb_layer'),
        require('./geo/leaflet/leaflet.geometry'),
        require('./geo/leaflet/leaflet'),

        require('./geo/gmaps/gmaps_base'),
        require('./geo/gmaps/gmaps_baselayer'),
        require('./geo/gmaps/gmaps_plainlayer'),
        require('./geo/gmaps/gmaps_tiledlayer'),
        require('./geo/gmaps/gmaps_cartodb_layergroup'),
        require('./geo/gmaps/gmaps_cartodb_layer'),
        require('./geo/gmaps/gmaps.geometry'),
        require('./geo/gmaps/gmaps'),

        require('./ui/common/dialog'),
        require('./ui/common/share'),
        require('./ui/common/notification'),
        require('./ui/common/table'),
        require('./ui/common/dropdown'),

        require('./vis/vis'),
        require('./vis/image'),
        require('./vis/overlays'),
        require('./vis/layers'),

        // PUBLIC API
        require('./api/layers'),
        require('./api/sql'),
        require('./api/vis.js')
    ];

    cdb.init = function (ready) {
        // define a simple class
        var Class = cdb.Class = function () {
        };
        _.extend(Class.prototype, Backbone.Events);

        cdb._loadJST();
        root.cdb.god = new Backbone.Model();

        cdb.files.forEach(function (module) {
            module(cdb)
        });

        ready && ready();
    };

    /**
     * load all the javascript files. For testing, do not use in production
     */
    cdb.load = function (prefix, ready) {
        var c = 0;

        var next = function () {
            var script = document.createElement('script');
            script.src = prefix + cdb.files[c];
            document.body.appendChild(script);
            ++c;
            if (c == cdb.files.length) {
                if (ready) {
                    script.onload = ready;
                }
            } else {
                script.onload = next;
            }
        };

        next();

    };
})();

},{"./api/layers":1,"./api/sql":2,"./api/vis.js":3,"./core/config":4,"./core/decorator":5,"./core/loader":6,"./core/log":7,"./core/model":8,"./core/profiler":9,"./core/sanitize":10,"./core/template":11,"./core/util":12,"./core/view":13,"./geo/common":14,"./geo/geocoder":15,"./geo/geometry":16,"./geo/gmaps/gmaps":18,"./geo/gmaps/gmaps.geometry":17,"./geo/gmaps/gmaps_base":19,"./geo/gmaps/gmaps_baselayer":20,"./geo/gmaps/gmaps_cartodb_layer":21,"./geo/gmaps/gmaps_cartodb_layergroup":22,"./geo/gmaps/gmaps_plainlayer":23,"./geo/gmaps/gmaps_tiledlayer":24,"./geo/layer_definition":25,"./geo/leaflet/leaflet":27,"./geo/leaflet/leaflet.geometry":26,"./geo/leaflet/leaflet_base":28,"./geo/leaflet/leaflet_cartodb_layer":29,"./geo/leaflet/leaflet_cartodb_layergroup":30,"./geo/leaflet/leaflet_gmaps_tiledlayer":31,"./geo/leaflet/leaflet_plainlayer":32,"./geo/leaflet/leaflet_tiledlayer":33,"./geo/leaflet/leaflet_wmslayer":34,"./geo/map":35,"./geo/sublayer":36,"./geo/ui/annotation":37,"./geo/ui/fullscreen":38,"./geo/ui/header":39,"./geo/ui/image":40,"./geo/ui/infobox":41,"./geo/ui/infowindow":42,"./geo/ui/layer_selector":43,"./geo/ui/legend":44,"./geo/ui/mobile":45,"./geo/ui/search":46,"./geo/ui/share":47,"./geo/ui/slides_controller":48,"./geo/ui/switcher":49,"./geo/ui/text":50,"./geo/ui/tiles_loader":51,"./geo/ui/tooltip":52,"./geo/ui/zoom":53,"./geo/ui/zoom_info":54,"./ui/common/dialog":55,"./ui/common/dropdown":56,"./ui/common/notification":57,"./ui/common/share":58,"./ui/common/table":59,"./vis/image":60,"./vis/layers":61,"./vis/overlays":62,"./vis/vis":63}]},{},["cartodb"])


//# sourceMappingURL=../maps/main.js.map