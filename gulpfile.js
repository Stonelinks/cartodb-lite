'use strict';
var gulp = require('gulp');
var sass = require('gulp-sass');
var webserver = require('gulp-webserver');
var sourcemaps = require('gulp-sourcemaps');
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var source = require('vinyl-source-stream');
var shim = require('browserify-shim');

var path = {
    style: './style/**/*.scss',
    images: './images/**/*',
    js: './src/**/*.js'
};

gulp.task('js', function() {
    var bundler = browserify({
        entries: ['./src/cartodb-lite.js'],
        debug: true
    });

    bundler.require('./src/cartodb-lite.js', {
        expose: 'cartodb'
    });
    bundler.transform(shim);

    // needed for tests to work
    //bundler.require('backbone.marionette');
    //bundler.require('jquery');

    var bundle = function() {
        return bundler
            .bundle()
            .pipe(source('cartodb.js'))
            .pipe(buffer())
            .pipe(sourcemaps.init({loadMaps: true}))
            .pipe(sourcemaps.write('../maps'))
            .pipe(gulp.dest('./build/js/'));
    };
    gulp.src('./js/test.js')
        .pipe(gulp.dest('./build/js'))
    return bundle();
});

gulp.task('style', function () {
    return gulp.src(path.style)
        .pipe(sourcemaps.init())
        .pipe(sass({errLogToConsole: true}))
        .pipe(sourcemaps.write('../maps'))
        .pipe(gulp.dest('./build/style'));
});

gulp.task('webserver', function() {
    return gulp.src('.')
        .pipe(webserver({
            host: '0.0.0.0',
            port: 8997,
            directoryListing: true,
            livereload: true,
            //open: true
        }));
});

gulp.task('index', function() {
    return gulp.src(path.index)
        .pipe(gulp.dest('./build/'));
});

gulp.task('images', function() {
    return gulp.src(path.images)
        .pipe(gulp.dest('./build/images'));
});

gulp.task('build', ['js']);

gulp.task('watch', ['build'], function() {
    gulp.watch(path.js, ['js']);
    //gulp.watch(path.style, ['style']);
    //gulp.watch(path.index, ['index']);
    //gulp.watch(path.data, ['data']);
    //gulp.watch(path.images, ['images']);
});

gulp.task('develop', ['watch', 'webserver']);

gulp.task('default', ['build']);