$.define("event", "node" ,function(){
    $.support.customEvent = false;
    try{
        var event = new CustomEvent("mass");
        $.support.customEvent = !event.initCustomEvent("mass",true,true,{});
    }catch(e){ };
    var level3 = $.support.customEvent;//DOM Level 3 Events
    var rhoverHack = /(?:^|\s)hover(\.\S+)?\b/,  rmapper = /(\w+)_(\w+)/g;
    //如果不存在添加一个
    var facade = $.event = $.event || {};
    //添加或增强二级属性eventAdapter
    $.Object.merge(facade,{
        eventAdapter:{
            focus: {
                delegateType: "focusin"
            },
            blur: {
                delegateType: "focusout"
            },
            beforeunload: {
                setup: function(src, _, _, fn ) {
                    // We only want to do this special case on windows
                    if ( $.type(src, "Window") ) {
                        src.onbeforeunload = fn;
                    }
                },
                teardown: function( src, _, _, fn ) {
                    if ( src.onbeforeunload === fn ) {
                        src.onbeforeunload = null;
                    }
                }
            }
        }
    });
    var adapter = $.event.eventAdapter, firing = {};
    function parseType(event, selector) {//"focusin.aaa.bbb"
        var parts = ('' + event).split('.');
        var ns = parts.slice(1).sort().join(' ');//aaa bbb
        var type = parts[0];
        var hack = adapter[ type ] || {}//focusin -> focus
        return {
            type : (selector ? hack.delegateType : hack.bindType ) || type,//focus
            origType: type,
            selector: selector,
            ns: ns,
            rns: ns ? new RegExp("(^|\\.)" + ns.replace(' ', ' .* ?') + "(\\.|$)") : null
        }
    }
    //events为要过滤的集合,后面个参数为过滤条件
    function findHandlers( events, hash, fn, expr ) {
        return events.filter(function(item) {
            return item && (!hash.rns  || hash.rns.test(item.ns))  //通过事件类型进行过滤
            && (!hash.origType || hash.origType === item.origType) //通过命名空间进行进行过滤
            && (!fn || fn.uniqueNumber === item.uuid)//通过uuid进行过滤
            && (!expr || expr === item.selector || expr === "**" && item.selector )//通过选择器进行过滤
        })
    }
    $.mix(facade,{
        match: function( cur, parent, expr ){
            var matcher = expr.input ? quickIs : $.match
            for ( ; cur != parent; cur = cur.parentNode || parent ) {
                if(matcher(cur, expr))
                    return true
            }
            return false;
        },
        fix: function(event, type){
            if( !event.originalEvent ){
                var originalEvent = event
                event = new jEvent(originalEvent);
                for( var p in originalEvent ){
                    if( (p in event) ||  /^[A-Z_]+$/.test(p) || typeof originalEvent[p] == "function"){
                        continue;//去掉所有方法与常量
                    } 
                    event[p] = originalEvent[p]
                }
                //如果不存在target属性，为它添加一个
                if ( !event.target ) {
                    event.target = event.srcElement || document;
                }
                //safari的事件源对象可能为文本节点，应代入其父节点
                if ( event.target.nodeType === 3 ) {
                    event.target = event.target.parentNode;
                }
                if ( event.metaKey === undefined ) {
                    event.metaKey = event.ctrlKey; //  处理组合键
                }
                if( /^(?:mouse|contextmenu)|click/.test( type ) ){
                    if ( event.pageX == null && event.clientX != null ) {  // 处理鼠标事件
                        var doc = event.target.ownerDocument || document,
                        html = doc.documentElement, body = doc.body;
                        event.pageX = event.clientX + (html && html.scrollLeft || body && body.scrollLeft || 0) - (html && html.clientLeft || body && body.clientLeft || 0);
                        event.pageY = event.clientY + (html && html.scrollTop  || body && body.scrollTop  || 0) - (html && html.clientTop  || body && body.clientTop  || 0);
                    }
                    //如果不存在relatedTarget属性，为它添加一个
                    if ( !event.relatedTarget && event.fromElement ) {
                        event.relatedTarget = event.fromElement === event.target ? event.toElement : event.fromElement;
                    }
                    //标准浏览判定按下鼠标哪个键，左1中2右3
                    var button = event.button
                    //IE event.button的意义
                    //0：没有键被按下 1：按下左键 2：按下右键 3：左键与右键同时被按下 4：按下中键 5：左键与中键同时被按下 6：中键与右键同时被按下 7：三个键同时被按下
                    if ( !event.which && isFinite(button) ) {
                        event.which  = [0,1,3,0,2,0,0,0][button];//0现在代表没有意义
                    }
                }
                if ( event.which == null ) {//处理键盘事件
                    event.which = event.charCode != null ? event.charCode : event.keyCode;
                }
                if( window.Touch && event.touches && event.touches[0] ){
                    event.pageX = event.touches[0].pageX//处理触摸事件
                    event.pageY = event.touches[0].pageY
                }
                if( type === "mousewheel" ){ //处理滚轮事件
                    if ("wheelDelta" in originalEvent){
                        var delta = originalEvent.wheelDelta/120;
                        //opera 9x系列的滚动方向与IE保持一致，10后修正
                        if( window.opera && opera.version() < 10 )
                            delta = -delta;
                        event.wheelDelta = Math.round(delta); //修正safari的浮点 bug
                    }else if( "detail" in originalEvent ){
                        event.wheelDelta = -event.detail/3;
                        $.log(event.wheelDelta)
                    }
                }
            }
            if( type ){
                event.type = type
            }
            return event;
        },

        bind: function( hash ){//hash 包含type fn times selector
            if( arguments.length > 1 ){
                throw "$.event bind method only need one argument, and it's a hash!"
            }
            var target = this, DOM =  $[ "@target" ] in target, events = $._data( target),
            types = hash.type, expr = hash.selector
            if( !events ){
                return
            }
            if( DOM ){ //处理DOM的hover事件
                types = types.replace( rhoverHack, "mouseover$1 mouseout$1" );
            }
            events = events.events || (events.events = []);
            hash.uuid = $.getUid( hash.fn ); //确保hash.uuid与fn.uuid一致
            types.replace( $.rword, function( old ){
                var item = parseType(old, expr);//"focusin.aaa.bbb"
                var type = item.origType;
                $.mix(item, {
                    scope: target,//this,用于绑定数据的
                    target: !DOM ? window : target,//如果是自定义事件,使用window来代理
                    index: events.length
                }, hash, false);
                events.push( item );//用于事件拷贝
                item.proxy = wrapper( item );
                var count =  events[type+"_count"] = ( events[type+"_count"] | 0 )+ 1;
                var hack = adapter[ type ];
                if( level3 && !hack ){//一个回调绑定一个代理
                    item.target.addEventListener(item.type, item.proxy, !!expr )
                }
                if(count == 1){
                    $._data( target, type+"_item", item)
                    if( DOM && (!hack || !hack.setup || hack.setup( item ) === false ) && !level3) {
                        $.bind(target, item.type, item.proxy, !!expr);//所有回调绑定一个代理
                    }
                }
               
            });
        },
        //外部的API已经确保typesr至少为空字符串
        unbind: function( hash  ) {
            var target = this, events = $._data( target, "events");
            if( !events ) return;
            var types = hash.type || "", expr = hash.selector, DOM = $["@target"] in target;
            if( DOM ){ //处理DOM的hover事件
                types = types.replace( rhoverHack, "mouseover$1 mouseout$1" );
            }
            types.replace( $.rword, function( t ){
                var parsed = parseType( t, expr), type = parsed.origType, hack = adapter[ type ];
                findHandlers(events, parsed , hash.fn, expr ).forEach( function(item){
                    if( level3 && !hack ){
                        item.target.removeEventListener( item.type, item.proxy, !!expr );
                    }
                    if( --events[type+"_count"] == 0){
                        if( DOM && ( !hack || !hack.teardown || hack.teardown( item ) === false ) && !level3 ) {
                            $.unbind( item.target, item.type, item.proxy, !!expr );
                        }
                        $.removeData( target, type+"_item", true );
                        delete events[ type+"_count"];
                    }
                    events[ item.index ] = null;
                })
            });
            for (var i = events.length; i >=0;i--) {
                if (events[i] == null){
                    events.splice(i, 1);
                }
            }
            if( !events.length ){
                $.removeData( target, "events") ;
            }
            return this;
        },
        _dispatch: function( src, type, event ){
            event = facade.fix( event, type );
            for(var i in src){
                if(src.hasOwnProperty(i)){
                    facade.dispatch( src[ i ], event );
                }
            }
        },
        dispatch: function(target, event){
            var item = $._data(target, event.type + "_item");//取得此元素此类型的第一个item
            item && item.proxy.call(target, event)
        },
        fire: function( event ){
            if(!event.originalEvent){
                event = new jEvent(event);
            }
            var type = event.origType || event.type;
            var detail = parseType(type, false);
            detail.args = [].slice.call(arguments,1) ;
            event.target = this;
            firing["@" + event.type] = detail;
            if( $["@target"] in this){
                var cur = this,  ontype = "on" + type;
                do{//模拟事件冒泡与执行内联事件
                    facade.dispatch( cur, event );
                    if (cur[ ontype ] && cur[ ontype ].call(cur) === false) {
                        event.preventDefault();
                    }
                    cur = cur.parentNode ||
                    cur.ownerDocument ||
                    cur === cur.ownerDocument && window;
                } while ( cur && !event.isPropagationStopped );
                if ( !event.isDefaultPrevented ) {//模拟默认行为 click() submit() reset() focus() blur()
                    var old;//在opera 中节点与window都有document属性
                    if (ontype && this[ type ] && ((type !== "focus" && type !== "blur") || this.offsetWidth !== 0) && !this.eval) {
                        old = this[ ontype ];
                        if (old) {   // 不用再触发内联事件
                            this[ ontype ] = null;
                        }
                        this[ type ]();
                    }
                    if ( old ) {
                        this[ ontype ] = old;
                    }
                }
            }else{//普通对象的自定义事件
                facade.dispatch(this, event);
            }
            delete  firing["@" + event.type];
        }
    });
  
    var wrapper = function( hash ){
        var fn = function(event){
            var type = hash.origType, queue = [ hash ], detail = firing["@"+ type ] || {}, scope = hash.scope//thisObject
            if(  adapter[ type ] || !level3 ){
                var win = ( scope.ownerDocument || scope.document || scope ).parentWindow || window
                event = facade.fix( event || win.event, type )
                event.currentTarget = scope;
                queue = ($._data( scope, "events") || []).concat();
            }
            var src = event.target;
            for ( var i = 0, item; item = queue[i++]; ) {
                if ( !src.disabled && !(event.button && event.type === "click")//fire
                    && ( event.type == item.origType )
                    && (!item.selector  || facade.match(src, scope, item.selector))//selector
                    && (!detail.rns || detail.rns.test( item.ns ) ) ) {//fire
                    var result = item.fn.apply( item.selector ? src : scope, [event].concat(detail.args || []));
                    if ( result !== void 0 ) {
                        event.result = result;
                        if ( result === false ) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }
                    if ( event.isImmediatePropagationStopped ) {
                        break;
                    }
                }
            }
            return result;
        }
        fn.uuid = hash.uuid;
        return fn;
    }
    if( level3 ){
        facade.fire = function(type){
            var detail = parseType(type, false);
            type = detail.type;
            detail.args = $.slice(arguments,1)
            var DOM = $["@target"] in this, event;
            firing["@"+type] = detail;
            if( !DOM || !$.eventSupport(type, this) ){
                event = new CustomEvent(type);
                event.initCustomEvent( type, true, true, detail );
            }else{
                var doc = this.ownerDocument || this.document || this;
                event = doc.createEvent("Events");
                event.initEvent(type, true, true, null, null, null, null, null, null, null, null, null, null, null, null);
            };
            ( DOM ? this : window).dispatchEvent(event);
            delete firing["@"+type]
            return this;
        }
    }
    var jEvent = $.Event = function ( event ) {
        this.originalEvent = event.type ? event: {};
        this.origType = event.type || event;
        this.type = (this.origType).replace(/\..*/g,"");
        this.timeStamp  = Date.now();
    };
    jEvent.prototype = {
        toString: function(){
            return "[object Event]"
        },
        preventDefault: function() {
            this.isDefaultPrevented = true;
            var e = this.originalEvent;
            if ( e.preventDefault ) {
                e.preventDefault();
            }// 如果存在returnValue 那么就将它设为false
            e.returnValue = false;
            return this;
        },
        stopPropagation: function() {
            var e = this.originalEvent;
            if ( e.stopPropagation ) {
                e.stopPropagation();
            } // 如果存在returnValue 那么就将它设为true
            e.cancelBubble = this.isPropagationStopped = true;
            return this;
        },
        stopImmediatePropagation: function() {
            this.isImmediatePropagationStopped = true;
            this.stopPropagation();
            return this;
        }
    };
    //事件派发器的接口
    //实现了这些接口的对象将具有注册事件和广播事件的功能
    //http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-EventTarget
    var revent = /(^|_|:)([a-z])/g
    $.EventTarget = {
        uniqueNumber : $.getUid({}),
        defineEvents : function( names ){
            var events = [];
            if(typeof names == "string"){
                events = names.match( $.rword ) || [];
            }else if($.isArray(names)){
                events = names;
            }
            events.forEach(function(name){
                var method = 'on'+name.replace(revent,function($, $1, $2) {
                    return $2.toUpperCase();
                });
                if (!(method in this)) {
                    this[method] = function() {
                        return $.fn.on.apply(this, [].concat.apply([name], arguments));
                    };
                }
            },this);
        }
    };
    "bind_on,unbind_off,fire_fire".replace( rmapper,function(_, type, mapper){
        $.EventTarget[ type ] = function(){
            $.fn[ mapper ].apply(this, arguments);
            return this;
        }
    });
    $.eventSupport = function( eventName,el ) {
        el = el || document.createElement("div");
        eventName = "on" + eventName;
        var ret = eventName in el;
        if ( el.setAttribute && !ret ) {
            el.setAttribute( eventName, "" );
            ret = typeof el[ eventName ] === "function";
            el.removeAttribute(eventName);
        }
        el = null;
        return ret;
    };
    var rquickIs = /^(\w*)(?:#([\w\-]+))?(?:\.([\w\-]+))?$/
    function quickParse( selector ) {
        var quick = rquickIs.exec( selector );
        if ( quick ) {
            //   0  1    2   3
            // [ _, tag, id, class ]
            quick[1] = ( quick[1] || "" ).toLowerCase();
            quick[3] = quick[3] && new RegExp( "(?:^|\\s)" + quick[3] + "(?:\\s|$)" );
        }
        return quick;
    }
    function quickIs( elem, m ) {
        var attrs = elem.attributes || {};
        return (
            (!m[1] || elem.nodeName.toLowerCase() === m[1]) &&
            (!m[2] || (attrs.id || {}).value === m[2]) &&
            (!m[3] || m[3].test( (attrs[ "class" ] || {}).value ))
            );
    }
    $.implement({
        toggle: function(/*fn1,fn2,fn3*/){
            var fns = [].slice.call(arguments), i = 0;
            return this.click(function(e){
                var fn  = fns[i++] || fns[i = 0, i++];
                fn.call( this, e );
            })
        },
        hover: function( fnIn, fnOut ) {
            return this.mouseenter( fnIn ).mouseleave( fnOut || fnIn );
        },
        delegate: function( selector, types, fn, times ) {
            return this.on( types, selector, fn, times);
        },
        live: function( types, fn, times ) {
            $( this.ownerDocument ).on( types, this.selector, fn, times );
            return this;
        },
        one: function( types, fn ) {
            return this.on( types, fn, 1 );
        },
        undelegate: function(selector, types, fn ) {/*顺序不能乱*/
            return arguments.length == 1? this.off( selector, "**" ) : this.off( types, fn, selector );
        },
        die: function( types, fn ) {
            $( this.ownerDocument ).off( types, fn, this.selector || "**", fn );
            return this;
        },
        fire: function(  ) {
            var args = arguments;
            if(this.mass && this.each){
                return this.each(function() {
                    $.event.fire.apply(this, args );
                });
            }else{
                return $.event.fire.apply(this, args );
            }
        }
    });
    "on_bind,off_unbind".replace( rmapper, function(_,method, mapper){
        $.fn[ method ] = function(types, selector, fn ){//$.fn.on $.fn.off
            if ( typeof types === "object" ) {
                for ( var type in types ) {
                    $.fn[ method ].call(this, type, selector, types[ type ], fn );
                }
                return this;
            }
            var hash = {};
            for(var i = 0 ; i < arguments.length; i++ ){
                var el = arguments[i];
                if(typeof el == "number"){
                    hash.times = el;
                }else if(typeof el == "function"){
                    hash.fn = el
                }if(typeof el === "string"){
                    if(hash.type != null){
                        hash.selector = el.trim()
                    }else{
                        hash.type = el.trim();
                        if(!/^[a-z0-9\.\s]+$/i.test(hash.type)){
                            throw "hash.type should be a combination of this event type and the namespace"
                        }
                    }
                }
            }
            if(method === "on"){
                if( !hash.type || !hash.fn ){//必须指定事件类型与回调
                    return this;
                }
                hash.times = hash.times > 0  ? hash.times : Infinity;
                hash.selector =  hash.selector ? quickParse( hash.selector ) : false
            }
            if(this.mass && this.each){
                return this.each(function() {
                    facade[ mapper ].call( this, hash );
                });
            }else{
                return facade[ mapper ].call( this, hash );
            }
        }
        $.fn[ mapper ] = function(){// $.fn.bind $.fn.unbind
            return $.fn[ method ].apply(this, arguments );
        }
    });
    var types = "contextmenu,click,dblclick,mouseout,mouseover,mouseenter,mouseleave,mousemove,mousedown,mouseup,mousewheel," +
    "abort,error,load,unload,resize,scroll,change,input,select,reset,submit,input,"+"blur,focus,focusin,focusout,"+"keypress,keydown,keyup"
    types.replace( $.rword, function( type ){
        $.fn[ type ] = function( callback ){
            return callback?  this.bind( type, callback ) : this.fire( type );
        }
    });
    /**
用于在标准浏览器下模拟mouseenter与mouseleave
现在除了IE系列支持mouseenter/mouseleave/focusin/focusout外
opera11,FF10也支持这四个事件,同时它们也成为w3c DOM3 Event的规范
详见http://www.filehippo.com/pl/download_opera/changelog/9476/
http://dev.w3.org/2006/webapi/DOM-Level-3-Events/html/DOM3-Events.html
 */
    if( !+"\v1" || !$.eventSupport("mouseenter")){
        "mouseenter_mouseover,mouseleave_mouseout".replace(rmapper, function(_, type, mapper){
            adapter[ type ]  = {
                setup: function( item ){//使用事件冒充
                    item[type+"_handle"]= $.bind( item.target, mapper, function( event ){
                        var parent = event.relatedTarget;
                        try {
                            while ( parent && parent !== item.target ) {
                                parent = parent.parentNode;
                            }
                            if ( parent !== item.target ) {
                                facade._dispatch( [ item.target ], type, event );
                            }
                        } catch(e) { };
                    })
                },
                teardown: function( item ){
                    $.unbind( item.target, mapper, item[ type+"_handle" ] );
                }
            };
        });
    }
    //在标准浏览器里面模拟focusin
    if( !$.eventSupport("focusin") ){//现在只有firefox 不支持focusin
        "focusin_focus,focusout_blur".replace(rmapper, function(_,type, mapper){
            var notice = 0, focusinNotify = function (event) {
                var src = event.target;
                do{//模拟冒泡
                    if( $._data(src, "events") ) {
                        facade._dispatch( [ src ], type, event );
                    } 
                } while (src = src.parentNode );
            }
            adapter[ type ] = {
                setup: function( ) {
                    if ( notice++ === 0 ) {
                        document.addEventListener( mapper, focusinNotify, true );
                    }
                },
                teardown: function() {
                    if ( --notice === 0 ) {
                        document.removeEventListener( mapper, focusinNotify, true );
                    }
                }
            };
        });
    }
    try{
        //FF需要用DOMMouseScroll事件模拟mousewheel事件
        document.createEvent("MouseScrollEvents");
        adapter.mousewheel = {
            bindType    : "DOMMouseScroll",
            delegateType: "DOMMouseScroll"
        }
        try{
            //可能末来FF会支持标准的mousewheel事件，则需要删除此分支
            document.createEvent("WheelEvent");
            delete adapter.mousewheel;
        }catch(e){};
    }catch(e){};

});
/**
2011.8.14 更改隐藏namespace,让自定义对象的回调函数也有事件对象
2011.9.17 事件发送器增加一个uniqueID属性
2011.9.21 重构bind与unbind方法 支持命名空间与多事件处理
2011.9.27 uniqueID改为uniqueNumber 使用$._data存取数据
2011.9.29 简化bind与unbind
2011.10.13 emit模块更名dispatcher 模块 升级为v2
2011.10.23 简化facade.handle与fire
2011.10.14 强化delegate 让快捷方法等支持fire 修复delegate BUG
2011.10.21 修复focusin focsuout的事件代理 增加fixAndDispatch处理事件冒充
2011.11.23 简化rquickIs
2011.12.20 修正在当前窗口为子窗口元素绑定错误时，在IE678下，事件对象错误的问题
2011.12.20 修正rhoverHack正则，现在hover可以作为命名空间了
2012.1.13 dispatcher模块更名target模块 升级为v3
2012.2.7 重构change，允许change事件可以通过fireEvent("onchange")触发
2012.2.8 添加mouseenter的分支判定，增强eventSupport
2012.2.9 完美支持valuechange事件
2012.4.1 target模块与event模块合并， 并分割出event_fix模块，升级为v4
2012.4.12 修正触摸屏下的pageX pageY
2012.5.1 让$.fn.fire支持自定义事件
*/