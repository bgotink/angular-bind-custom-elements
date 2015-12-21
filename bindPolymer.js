/**
 * The bind-polymer directive binds Polymer to Angular 1.x
 *
 * @license MIT (see LICENSE.md)
 * @author Bram Gotink <github.com/bgotink>
 * @see inspired by the work of Chris Strom et al, see <https://github.com/eee-c/angular-bind-polymer>
 */

angular
.module('bindPolymer', [])
.directive('bindPolymer', [
  '$parse',
  '$interpolate',
  function($parse, $interpolate) {
    function polySet(element, attribute, value) {
      if (element.set) {
        element.set(attribute, value);
      } else {
        element[attribute] = value;
      }
    }

    return {
      // attribute only, NOT element (obviously, as this directive is to be used on a polymer element)
      restrict: 'A',

      // we do NOT require a scope, thanks for asking ;)
      scope : false,

      /*
       * Process the attributes once, use those in the link function.
       */
      compile: function (el, attributes) {
        var angularAttributeMap = {};

        Object.keys(attributes)
        .forEach(function (property) {
          if (!attributes.hasOwnProperty(property)) {
            return;
          }

          if (!property.match(/^pl[A-Z]/)) {
            return;
          }

          var attribute = attributes[property];

          // remove leading `pl-` from attribute name
          property = property.charAt(2).toLowerCase() + property.slice(3);
          var isExpression = attribute.match(/\{\{\s*[\.\w]+\s*\}\}/);

          // $interpolate expressions, $parse the rest
          if (isExpression) {
            angularAttributeMap[property] = $interpolate(attribute);
          } else {
            angularAttributeMap[property] = $parse(attribute);
          }

          // remove attribute, we don't need it anymore
          attributes.$set(property, undefined);
        });

        return function link(scope, element) {
          Object.keys(angularAttributeMap)
          .forEach(function (property) {
            var angularValue = angularAttributeMap[property];
            var initial = true;

            // link _to_ polymer
            scope.$watch(angularValue, function (newValue) {
              if (initial) {
                initial = false;

                if (angular.isUndefined(newValue) && !angular.isUndefined(element[0][property])) {
                  // known in polymer, not yet in angular...
                  // so we send the polymer default to angular
                  if (typeof angularValue.assign === 'function') {
                    angularValue.assign(scope, element[0][property]);
                    return;
                  }
                }
              }

              // if-check not really needed, Polymer does a similar check.
              if (newValue !== element[0][property]) {
                polySet(element[0], property, newValue);
              }
            });

            // link _from_ polymer
            if (typeof angularValue.assign === 'function') {
              element.on(property + '-changed', function (e) {
                // $evalAsync seems like the logical choice: use the current
                // digest loop if available, else start one in the future
                scope.$evalAsync(function () {
                  // this if-check IS needed to prevent unnecessary assigns
                  if (angularValue(scope) !== e.detail.value) {
                    angularValue.assign(scope, e.detail.value);
                  }
                });
              });
            }
          });
        };
      }
    };
  }
]);
