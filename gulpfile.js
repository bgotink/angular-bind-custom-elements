const gulp = require('gulp');
const babel = require('gulp-babel');
const del = require('del');
const umd = require('gulp-umd');
const uglify = require('gulp-uglify');
const rename = require('gulp-rename');
const connect = require('gulp-connect');
const { protractor, webdriver_standalone, webdriver_update } = require('gulp-protractor');

gulp.task('webdriver_standalone', webdriver_standalone);
gulp.task('webdriver_update', webdriver_update);

gulp.task('test', ['webdriver_update'], function() {
  return new Promise(function(resolve, reject) {
    connect.server({ port: 8000 });
    // Called when the tests either complete or error
    // This function will kill the server and tell the gulp process
    // to either abort (if tests failed) or carry on
    function handleEnd(err) {
      connect.serverClose();
      if (err) {
        return reject(err);
      } else {
        return resolve();
      }
    }
    gulp.src(['**/*-spec.js'])
      .pipe(protractor({
          configFile: 'protractor.conf.js',
          args: ['--baseUrl', 'http://127.0.0.1:8000']
      }))
      .on('error', handleEnd)
      .on('close', handleEnd);
  });
});

gulp.task('clean', () => del(['dist']));

gulp.task('build', ['clean', 'test'], () =>
  gulp.src([
      'src/bindCustomElement.js'
    ])
    .pipe(babel({
      presets: [ 'es2015' ]
    }))
    .pipe(umd({
      dependencies: function(file) {
        return [{ name: 'angular' }];
      },
      exports: function(file) {
        return "'bgotink.customElements'";
      },
      namespace: function(file) {
        return 'returnExports';
      }
    }))
    .pipe(gulp.dest('dist'))
    .pipe(uglify())
    .pipe(rename('bindCustomElement.min.js'))
    .pipe(gulp.dest('dist'))
);

gulp.task('default', ['build']);