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
