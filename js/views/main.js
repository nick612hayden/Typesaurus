define([
    'jquery',
    'underscore',
    'backbone',

    'text!templates/main.html',
    'views/editor',
    'views/word/definitions'

], function($, _, Backbone, mainTemplate, editorView, defView){

    var mainView = Backbone.View.extend({
        el: $("#content"),

        render: function(){
            this.el.html(mainTemplate);
            editorView.render();
            defView.render();
        }
    });

    return new mainView;
});
