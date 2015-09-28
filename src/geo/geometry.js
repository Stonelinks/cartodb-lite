var Backbone = require('backbone')
var _ = require('underscore')

module.exports = function (cdb) {


    /**
     * basic geometries, all of them based on geojson
     */
    cdb.geo.Geometry = cdb.core.Model.extend({
        isPoint: function () {
            var type = this.get('geojson').type;
            if (type && type.toLowerCase() === 'point')
                return true;
            return false;
        }
    });

    cdb.geo.Geometries = Backbone.Collection.extend({});

    /**
     * create a geometry
     * @param geometryModel geojson based geometry model, see cdb.geo.Geometry
     */
    function GeometryView() {
    }

    _.extend(GeometryView.prototype, Backbone.Events, {

        edit: function () {
            throw new Error("to be implemented");
        }

    });

    cdb.geo.GeometryView = GeometryView;
}