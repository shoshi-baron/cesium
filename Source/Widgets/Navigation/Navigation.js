/*global define*/
define([
        '../../Core/defaultValue',
        '../../Core/defineProperties',
        '../../Core/destroyObject',
        '../../Core/DeveloperError',
        '../getElement',
        '../../ThirdParty/knockout'
    ], function(
        defaultValue,
        defineProperties,
        destroyObject,
        DeveloperError,
        getElement,
        knockout) {
    "use strict";

    var svgNS = "http://www.w3.org/2000/svg";
    var xlinkNS = "http://www.w3.org/1999/xlink";

    var widgetForDrag;
    var pointerDragged;

    function subscribeAndEvaluate(owner, observablePropertyName, callback, target) {
        callback.call(target, owner[observablePropertyName]);
        return knockout.getObservable(owner, observablePropertyName).subscribe(callback, target);
    }

    //Dynamically builds an SVG element from a JSON object.
    function svgFromObject(obj) {
        var ele = document.createElementNS(svgNS, obj.tagName);
        for ( var field in obj) {
            if (obj.hasOwnProperty(field) && field !== 'tagName') {
                if (field === 'children') {
                    var i;
                    var len = obj.children.length;
                    for (i = 0; i < len; ++i) {
                        ele.appendChild(svgFromObject(obj.children[i]));
                    }
                } else if (field.indexOf('xlink:') === 0) {
                    ele.setAttributeNS(xlinkNS, field.substring(6), obj[field]);
                } else if (field === 'textContent') {
                    ele.textContent = obj[field];
                } else {
                    ele.setAttribute(field, obj[field]);
                }
            }
        }
        return ele;
    }

    function svgText(x, y, msg) {
        var text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', 'cesium-navigation-svgText');

        var tspan = document.createElementNS(svgNS, 'tspan');
        tspan.textContent = msg;
        text.appendChild(tspan);
        return text;
    }

    function setZoomTiltRingPointer(zoomTiltRingPointer, angle) {
        zoomTiltRingPointer.setAttribute('transform', 'translate(100, 100) rotate(' + angle + ')');
    }

    function circularButton(x, y, path) {
        var button = {
            tagName : 'g',
            'class' : 'cesium-navigation-circularButton',
            transform : 'translate(' + x + ',' + y + ')',
            children : [{
                tagName : 'circle',
                'class' : 'cesium-navigation-buttonMain',
                cx : 0,
                cy : 0,
                r : 10
            }, {
                tagName : 'use',
                'class' : 'cesium-navigation-buttonPath',
                'xlink:href' : path
            }]
        };
        return svgFromObject(button);
    }

    function arrowButton(x, y, angle, path) {
        var arrow = {
            tagName : 'use',
            transform : 'translate(' + x + ',' + y + ') rotate(' + angle + ')',
            'class' : 'cesium-navigation-arrow',
            'xlink:href' : path
        };
        return svgFromObject(arrow);
    }

    function getDragging(widget) {
        var viewModel = widget._viewModel;
        if (pointerDragged === widget._zoomRingPointer) {
            return viewModel.zoomRingDragging;
        } else if (pointerDragged === widget._tiltRingPointer) {
            return viewModel.tiltRingDragging;
        } else if (pointerDragged === widget._knobOuterN) {
            return viewModel.northRingDragging;
        } else if (pointerDragged === widget._panJoystick) {
            return viewModel.panJoystickDragging;
        }
    }

    function adjustedAngle(angle, zeroAngle) {
        angle -= zeroAngle;
        if (angle > 180) {
            angle -= 360;
        }

        if (angle < -90) {
            angle = -180 - angle;
        } else if (angle > 90) {
            angle = 180 - angle;
        }
        return angle;
    }

    function setPointerFromMouse(widget, e) {
        var viewModel = widget._viewModel;
        var pointerDragging = getDragging(widget);

        if (pointerDragging && (widgetForDrag !== widget)) {
            return;
        }

        if (e.type === 'mousedown' || (pointerDragging && e.type === 'mousemove') ||
                (e.type === 'touchstart' && e.touches.length === 1) ||
                (pointerDragging && e.type === 'touchmove' && e.touches.length === 1)) {
            var centerX = widget._centerX;
            var centerY = widget._centerY;
            var svg = widget._svgNode;
            var rect = svg.getBoundingClientRect();
            var clientX;
            var clientY;
            if (e.type === 'touchstart' || e.type === 'touchmove') {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            if (!pointerDragging &&
                (clientX > rect.right ||
                 clientX < rect.left ||
                 clientY < rect.top ||
                 clientY > rect.bottom)) {
                return;
            }

            var pointerRect = pointerDragged.getBoundingClientRect();

            var x = clientX - centerX - rect.left;
            var y = clientY - centerY - rect.top;

            var angle = Math.atan2(y, x) * 180 / Math.PI;
            var distance = Math.sqrt(x*x + y*y);
            if (pointerDragged === widget._zoomRingPointer) {
                angle = adjustedAngle(angle, -180);
            } else if (pointerDragged === widget._tiltRingPointer) {
                angle = adjustedAngle(angle, 0);
            } else if (pointerDragged === widget._knobOuterN) {
                angle += 90;
            }

            if (angle > 180) {
                angle -= 360;
            }

            if (pointerDragging || (clientX < pointerRect.right && clientX > pointerRect.left && clientY > pointerRect.top && clientY < pointerRect.bottom)) {
                widgetForDrag = widget;
                if (pointerDragged === widget._zoomRingPointer) {
                    viewModel.zoomRingDragging = true;
                    viewModel.zoomRingAngle = angle;
                } else if (pointerDragged === widget._tiltRingPointer) {
                    viewModel.tiltRingDragging = true;
                    viewModel.tiltRingAngle = angle;
                } else if (pointerDragged === widget._knobOuterN) {
                    viewModel.northRingDragging = true;
                    viewModel.northRingAngle = angle;
                } else if (pointerDragged === widget._panJoystick) {
                    viewModel.panJoystickDragging = true;
                    viewModel.pointerDistance = distance;
                    viewModel.pointerDirection = angle;
                }
            } else {
                widgetForDrag = widget;
                if (pointerDragged === widget._zoomRingPointer) {
                    viewModel.zoomRingDragging = true;
                    viewModel.zoomRingAngle = angle;
                }
            }
            e.preventDefault();
        } else {
            widgetForDrag = undefined;
            pointerDragged = undefined;
            viewModel.zoomRingDragging = false;
            viewModel.tiltRingDragging = false;
            viewModel.northRingDragging = false;
            viewModel.panJoystickDragging = false;
        }
    }

    var Navigation = function(container, viewModel) {
        if (typeof container === 'undefined') {
            throw new DeveloperError('container is required.');
        }

        if (typeof viewModel === 'undefined') {
            throw new DeveloperError('viewModel is required.');
        }

        container = getElement(container);

        this._viewModel = viewModel;
        this._container = container;

        this._centerX = 0;
        this._centerY = 0;
        this._dragging = false;

        var svg = document.createElementNS(svgNS, 'svg:svg');
        this._svgNode = svg;

        //Define the XLink namespace that SVG uses
        svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', xlinkNS);

        var topG = document.createElementNS(svgNS, 'g');
        this._topG = topG;

        var zoomRing = svgFromObject({
            tagName : 'use',
            'class' : 'cesium-navigation-zoomRing',
            transform : 'translate(60,168)',
            'xlink:href' : '#navigation_pathZoomTiltRing'
        });
        this._zoomRing = zoomRing;

        var zoomPlus = circularButton(60, 30, '#navigation_pathPlus');
        var zoomMinus = circularButton(60, 168, '#navigation_pathMinus');

        this._zoomRingPointer = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-zoomRingPointer',
            cx : -80,
            cy : 0,
            r : 10
        });

        var zoomRingG = document.createElementNS(svgNS, 'g');
        zoomRingG.setAttribute('class', 'cesium-navigation-zoomRingG');

        zoomRingG.appendChild(zoomRing);
        zoomRingG.appendChild(zoomPlus);
        zoomRingG.appendChild(zoomMinus);
        zoomRingG.appendChild(this._zoomRingPointer);

        var tiltRing = svgFromObject({
            tagName : 'use',
            'class' : 'cesium-navigation-tiltRing',
            transform : 'translate(140,168) scale(-1,1)',
            'xlink:href' : '#navigation_pathZoomTiltRing'
        });
        this._tiltRing = tiltRing;

        var tiltTiltRect = circularButton(140, 30, '#navigation_pathTiltRect');
        var tiltRect = circularButton(140, 168, '#navigation_pathRect');

        this._tiltRingPointer = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-tiltRingPointer',
            cx : 80,
            cy : 0,
            r : 10
        });

        var tiltRingG = document.createElementNS(svgNS, 'g');
        tiltRingG.setAttribute('class', 'cesium-navigation-tiltRingG');

        tiltRingG.appendChild(tiltRing);
        tiltRingG.appendChild(tiltTiltRect);
        tiltRingG.appendChild(tiltRect);
        tiltRingG.appendChild(this._tiltRingPointer);

        var knobG = svgFromObject({
           tagName : 'g',
           transform : 'translate(100,100)'
        });

        var knobOuter = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-knobOuter',
            cx : 0,
            cy : 0,
            r : 60
        });

        this._knobOuterN = svgText(0, -42, 'N');

        var knobInnerAndShieldSize = 40;

        var knobInner = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-knobInner',
            cx : 0,
            cy : 0,
            r : knobInnerAndShieldSize
        });

        var knobShield = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-blank',
            cx : 0,
            cy : 0,
            r : knobInnerAndShieldSize
        });

        this._panJoystick = svgFromObject({
            tagName : 'circle',
            'class' : 'cesium-navigation-panJoystick',
            cx : 0,
            cy : 0,
            r : 10
        });

        this._panG = document.createElementNS(svgNS, 'g');

        this._panG.appendChild(this._panJoystick);

        var arrowCenterRadius = 20;
        var arrowsG = document.createElementNS(svgNS, 'g');
        var upArrow = arrowButton(0, -arrowCenterRadius, 180, '#navigation_pathArrow');
        var rightArrow = arrowButton(arrowCenterRadius, 0, -90, '#navigation_pathArrow');
        var downArrow = arrowButton(0, arrowCenterRadius, 0, '#navigation_pathArrow');
        var leftArrow = arrowButton(-arrowCenterRadius, 0, 90, '#navigation_pathArrow');
        arrowsG.appendChild(upArrow);
        arrowsG.appendChild(rightArrow);
        arrowsG.appendChild(downArrow);
        arrowsG.appendChild(leftArrow);

        knobG.appendChild(knobOuter);
        knobG.appendChild(knobInner);
        knobG.appendChild(knobShield);
        knobG.appendChild(arrowsG);
        knobG.appendChild(this._panG);

        topG.appendChild(zoomRingG);
        topG.appendChild(tiltRingG);
        topG.appendChild(knobG);
        topG.appendChild(this._knobOuterN);

        svg.appendChild(topG);
        container.appendChild(svg);

        var that = this;
        var mouseCallback = function(e) {
            setPointerFromMouse(that, e);
        };
        this._mouseCallback = mouseCallback;

        var zoomMouseCallback = function(e) {
            pointerDragged = that._zoomRingPointer;
            setPointerFromMouse(that, e);
        };

        var tiltMouseCallback = function(e) {
            pointerDragged = that._tiltRingPointer;
            setPointerFromMouse(that, e);
        };

        var northRingMouseCallback = function(e) {
            pointerDragged = that._knobOuterN;
            setPointerFromMouse(that, e);
        };

        var panJoystickMouseCallback = function(e) {
            pointerDragged = that._panJoystick;
            setPointerFromMouse(that, e);
        };

        document.addEventListener('mousemove', mouseCallback, true);
        document.addEventListener('mouseup', mouseCallback, true);
        this._knobOuterN.addEventListener('mousedown', northRingMouseCallback, true);
        this._panJoystick.addEventListener('mousedown', panJoystickMouseCallback, true);
        this._zoomRingPointer.addEventListener('mousedown', zoomMouseCallback, true);
        this._tiltRingPointer.addEventListener('mousedown', tiltMouseCallback, true);
        this._zoomRing.addEventListener('mousedown', zoomMouseCallback, true);
        zoomPlus.addEventListener('mousedown', zoomMouseCallback, true);
        zoomMinus.addEventListener('mousedown', zoomMouseCallback, true);
        this._subscriptions = [
        subscribeAndEvaluate(viewModel, 'zoomRingAngle', function(value) {
            setZoomTiltRingPointer(that._zoomRingPointer, value);
        }),

        subscribeAndEvaluate(viewModel, 'tiltRingAngle', function(value) {
            setZoomTiltRingPointer(that._tiltRingPointer, value);
        }),

        subscribeAndEvaluate(viewModel, 'northRingAngle', function(value) {
            setZoomTiltRingPointer(that._knobOuterN, value);
        }),

        subscribeAndEvaluate(viewModel, 'pointerDistance', function(distance) {
            that._panJoystick.setAttribute('transform', 'translate(' + distance + ', 0)');
        }),

        subscribeAndEvaluate(viewModel, 'pointerDirection', function(direction) {
            that._panG.setAttribute('transform', 'rotate(' + direction + ')');
        })];

        this.applyThemeChanges();
        this.resize();
    };

    defineProperties(Navigation.prototype, {
       container : {
           get : function() {
               return this._container;
           }
       },

       viewModel : {
           get : function() {
               return this._viewModel;
           }
       }
    });

    Navigation.prototype.resize = function() {
        var parentWidth = this._container.clientWidth;
        var parentHeight = this._container.clientHeight;
        if (parentWidth === this._lastWidth && parentHeight === this._lastHeight) {
            return;
        }

        var svg = this._svgNode;

        //The width and height as the SVG was originally drawn
        var baseWidth = 200;
        var baseHeight = 200;

        var width = parentWidth;
        var height = parentHeight;

        if(parentWidth === 0 && parentHeight === 0) {
            width = baseWidth;
            height = baseHeight;
        } else if (parentWidth === 0) {
            height = parentHeight;
            width = baseWidth * (parentHeight / baseHeight);
        } else if (parentHeight === 0) {
            width = parentWidth;
            height = baseHeight * (parentWidth / baseWidth);
        }

        var scaleX = width / baseWidth;
        var scaleY = height / baseHeight;

        svg.style.cssText = 'width: ' + width + 'px; height: ' + height + 'px; position: absolute; bottom: 15; left: 0;';
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

        this._topG.setAttribute('transform', 'scale(' + scaleX + ',' + scaleY + ')');

        this._centerX = Math.max(1, 100.0 * scaleX);
        this._centerY = Math.max(1, 100.0 * scaleY);

        this._lastHeight = parentHeight;
        this._lastWidth = parentWidth;
    };

    Navigation.prototype.applyThemeChanges = function() {
        var defsElement = svgFromObject({
           tagName : 'defs',
           children : [{
               id : 'navigation_pathZoomTiltRing',
               tagName : 'path',
               d : 'M0,0 a80,80 1 0,1 0,-138.564'
           }, {
               id : 'navigation_pathPlus',
               tagName : 'path',
               d : 'M-7,2,-2,2,-2,7,2,7,2,2,7,2,7,-2,2,-2,2,-7,-2,-7,-2,-2,-7,-2,-7,2Z'
           }, {
               id : 'navigation_pathMinus',
               tagName : 'path',
               d : 'M-7,2,7,2,7,-2,-7,-2,-7,2Z'
           }, {
               id : 'navigation_pathTiltRect',
               tagName : 'path',
               d : 'M-3,-4,-6,4,6,4,3,-4,-3,-4Z'
           }, {
               id : 'navigation_pathRect',
               tagName : 'path',
               d : 'M-5,-7,-5,7,5,7,5,-7,-5,-7Z'
           }, {
               id : 'navigation_pathArrow',
               tagName : 'path',
               d : 'M-8,0,0,10,8,0,-8,0Z'
           }]
        });

        if (typeof this._defsElement === 'undefined') {
            this._svgNode.appendChild(defsElement);
        } else {
            this._svgNode.replaceChild(defsElement, this._defsElement);
        }
        this._defsElement = defsElement;
    };

    return Navigation;
});
