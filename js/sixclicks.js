var lissn=lissn||{};

jabber.client={
  connection:   null,
  jid:"",
  features:     null,
  startquestion: 0,
  appName:      'sixclicks',
  domainName: 'dev.triviapad.com',
  conference:'rooms.dev.triviapad.com',
  BOSH_URL:"http://dev.triviapad.com:5280/http-bind/",

  init:function(){
    jabber.client.setup_namespaces();
    jabber.client.addHandlers();
  },

  setup_namespaces: function() {
      Strophe.addNamespace('PUBSUB', 'http://jabber.org/protocol/pubsub');
      Strophe.addNamespace('PEP', 'http://jabber.org/protocol/pubsub#event');
      Strophe.addNamespace('TUNE', 'http://jabber.org/protocol/tune');
      Strophe.addNamespace('CAPS', 'http://jabber.org/protocol/caps');
      Strophe.addNamespace('CLIENT', 'jabber:client');
      Strophe.addNamespace('ROSTER', 'jabber:iq:roster');
      Strophe.addNamespace('CHATSTATES', 'http://jabber.org/protocol/chatstates');
      Strophe.addNamespace('MUC', 'http://jabber.org/protocol/muc');
      Strophe.addNamespace('MUC_USER', 'http://jabber.org/protocol/muc#user');
      Strophe.addNamespace('MUC_OWNER', 'http://jabber.org/protocol/muc#owner');
      Strophe.addNamespace("GEOLOC","http://jabber.org/protocol/geoloc");

      jabber.client.NS={
        "CHAT":"convo_chat",
        "COMMAND":'lissn_command',
        "INFO":"lissn_infomation"
      };

  },//end setup_namespaces

  addHandlers:function(){
    $("#signin").click(function(ev) {
       if (jabber.client.connection) {
         jabber.client.disconnect();
         $("#signin").html("Sign in");
       } else {
         var chatjid = $("#jid").val();
         var password = $("#pass").val();
         jabber.client.connect(chatjid, password);
       }
    });
    
    $("#joingame").click(function(ev) {
      var gameid = $("#gameid").val();
      jabber.client.join_game_iq(gameid, true);
    });

    $("#leavegame").click(function(ev) {
      var gameid = $("#leavegameid").val();
      jabber.client.join_game_iq(gameid, false);
    });

    $("#discoitems").click(function(ev) {
      jabber.client.disco_items_iq();
    });

    $("#answergame").click(function(ev) {
      var answergameid = $("#answergameid").val();
      var gameid = $("#gameid").val();
      jabber.client.answer_msg(answergameid, gameid);
    });
  },

  rawInput:function(data) {
    var restype = $(data).attr('type');
    if (restype === "question") {
      jabber.client.startquestion = new Date().getTime();
      $(".question-log").text(data);
      var qId = $(data).attr('id');
      $("#trackanswer").text(qId);
    } else if (restype === "ranking") {
      var ranktag = $(data).find("rank");
      var rtype = ranktag.attr('type');
      if (rtype === "question")
        $(".question-ranking").text(data);
      else if (rtype === "game")
        $(".game-ranking").text(data);
    } else
      $(".response-log").text(data);
  },

  rawOutput:function(data) {
    var anstype = $(data).attr('type');
    if (anstype === "answer") {
      $(".answer-log").text(data);
//    } else if (anstype === "ranking") {
//      $(".game-ranking").text(data);
    } else
      $(".request-log").text(data);
  },

  connect:function(chatjid, password){
    var conn = new Strophe.Connection(jabber.client.BOSH_URL);
    jabber.client.jid = chatjid+"@"+jabber.client.domainName;
//    console.log("usr " + chatjid + ", pass " + password);
    conn.connect(jabber.client.jid,password, function (status) {
      if (status === Strophe.Status.CONNECTED) {
        $("#signin").html("Sign out");
        jabber.client.send_available_presence();
      }
      else if (status === Strophe.Status.DISCONNECTED || status===Strophe.Status.AUTHFAIL) {
//        console.log("[fail to connect]");
          $(".response-log").text("[disconnect]");
	  jabber.client.connection=null;
      }
    });

    conn.rawInput = jabber.client.rawInput;
    conn.rawOutput = jabber.client.rawOutput;
    jabber.client.connection=conn;
  },

  disconnect:function() {
    jabber.client.send_unavailable_presence();
    jabber.client.connection.sync=true;
    jabber.client.connection.flush();
    jabber.client.connection.disconnect();
    //jabber.client.connection=null;
  },

  join_game_iq: function(game, isJoin) {
    var event_node = null;
    if (isJoin) {
      event_node = 'join_game';
    } else {
      event_node = 'leave_game';
    }
    var command_id =jabber.client.connection.getUniqueId("command");
    var command_attrs = {
        'xmlns': 'http://jabber.org/protocol/commands',
        'node' : event_node,
        'action' : 'execute'
    };

    var commandIq = $iq({
      'to': "triviajabber."+jabber.client.domainName,
      'from': jabber.client.connection.jid,
      'id': command_id,
      'type': 'set'
    })
      .c('command', command_attrs)
      .c('x', {'xmlns': 'jabber:x:data', 'type': 'submit'})
      .c('field', {'var': 'game_id'}).c('value').t(game);

    command_callback = function(e) {
      var c = $(e).find('command');
      if (c.attr("status") == "completed") {
        var returniq = c.find('x item');
        var r = returniq.attr("return");
        var d = returniq.attr("desc");
//        jabber.client.join_game_callback_success=true;
      }
//      if(!jabber.client.join_game_callback_success){
//        jabber.client.join_game_callback_success=true;
//      }
      return true;
    };
    jabber.client.connection.addHandler(command_callback, 'jabber:client', 'iq', 'result', command_id, null);
    jabber.client.connection.send(commandIq.tree());
  },

  disco_items_iq: function() {
    var query_id =jabber.client.connection.getUniqueId("query");
    var query_attrs = {
        'xmlns': 'http://jabber.org/protocol/disco#items',
    };
    
    var queryIq = $iq({
      'to': "triviajabber."+jabber.client.domainName,
      'from': jabber.client.connection.jid,
      'id': query_id,
      'type': 'get'
    }).c('query', query_attrs);

    command_callback = function(e) {
      var c = $(e).find('query');
      var namespace = c.attr("xmlns");
      // TODO: show list of games
      return true;
    };
    jabber.client.connection.addHandler(command_callback, 'jabber:client', 'iq', 'result', query_id, null);
    jabber.client.connection.send(queryIq.tree());
  },

  send_available_presence: function() {
    var availablePresence = $pres()
            .c('show').t('chat').up()
            .c('status').t('online');
    jabber.client.connection.send(availablePresence);
  },

  send_unavailable_presence: function() {
    var unavailablePresence = $pres({type:"unavailable"})
	.c('show').t('gone');

    jabber.client.connection.send(unavailablePresence);
  },

  answer_msg: function(myans, slug) {
    var hittime = new Date().getTime() - jabber.client.startquestion;
    var qId = $("#trackanswer").text();
    var toSlug = slug + "@triviajabber."+jabber.client.domainName;
    var answer_attr = {
      "id": myans,
      "time": hittime
    };
    var answer_msg = $msg({to: toSlug, "type": "answer", "id": qId})
        .c("answer", answer_attr);

    jabber.client.connection.send(answer_msg);
  }
}; // end jabber.client

$(document).ready(function(){
  jabber.client.init();
});

window.onbeforeunload=function(){
  jabber.client.disconnect();
};
