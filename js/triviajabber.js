var jabber=jabber||{};

jabber.client = {
  connection:   null,
  jid: "",
  nickname: "",
  features:     null,
  startquestion: 0,
  appName:      'triviajabber',
  domainName: 'dev.triviapad.com',
  mucNode:'rooms.dev.triviapad.com',
  gameNode: 'triviajabber.dev.triviapad.com',
  BOSH_URL:"http://dev.triviapad.com:5280/http-bind/",

  // Instance variables
  gameStatus: '',
  roomSlug: '',
  roomName: '',
  gameJid: '',
  mucJid: '',
  answerId: 0,

  init: function(){
    jabber.client.setup_namespaces();
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
      Strophe.addNamespace('TRIVIAJABBER', 'http://jabber.org/protocol/triviajabber');

      jabber.client.NS={
        "CHAT":"convo_chat",
        "COMMAND":'lissn_command',
        "INFO":"lissn_infomation"
      };
  }, //end setup_namespaces

  connect: function(chatjid, password) {
    var conn = new Strophe.Connection(jabber.client.BOSH_URL);
    jabber.client.jid = chatjid+"@"+jabber.client.domainName;
//    console.log("usr " + chatjid + ", pass " + password);
    conn.connect(jabber.client.jid,password, function (status) {
      if (status === Strophe.Status.CONNECTED) {
        jabber.client.nickname = chatjid
        $("div#topbar div.blockbar-right li#player-menu a").html(jabber.client.nickname);
        console.log('Connected as ' + jabber.client.nickname + ' at ' + jabber.client.domainName );
        $("#login-submit").html("Connected!");
        jabber.client.send_available_presence();
        console.log('Presence available sent.');
        // Change to Rooms list
        $("main#loginview").hide();
        $("main#hallroom").show();
        jabber.client.disco_items_iq();
      }
      else if (status === Strophe.Status.DISCONNECTED || status === Strophe.Status.AUTHFAIL) {
//      console.log("[fail to connect]");
        $(".response-log").text("[disconnect]");
        $("#login-submit").disabled = false;
        jabber.client.connection=null;
      }
    });

    conn.rawInput = jabber.client.rawInput;
    conn.rawOutput = jabber.client.rawOutput;
    jabber.client.connection = conn;
  },

  disconnect: function() {
    jabber.client.send_unavailable_presence();
    jabber.client.connection.sync=true;
    jabber.client.connection.flush();
    jabber.client.connection.disconnect();
    //jabber.client.connection=null;
  },

  rawInput: function(stanza) {
    var stanzaType = $(stanza).attr('type');
    console.debug("INPUT ::: " + stanzaType + " ===> " + stanza )    
  },

  rawOutput: function(stanza) {
    var stanzaType = $(stanza).attr('type');
    console.debug("OUTPUT ::: " +  stanzaType + " ===> " + stanza )
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

  disco_items_iq: function() {
    var query_id =jabber.client.connection.getUniqueId("query");
    var query_attrs = {
        'xmlns': 'http://jabber.org/protocol/disco#items',
    };
    
    var queryIq = $iq({
      'to': jabber.client.gameNode,
      'from': jabber.client.connection.jid,
      'id': query_id,
      'type': 'get'
    }).c('query', query_attrs);

    disco_items_callback = function(stanza) {
      console.log("disco_items_callback triggered")
      if ($(stanza).attr("type") == 'result') {
        var groupedGames = $(stanza).find('query');
        var namespace = groupedGames.attr("xmlns");
        processRoomList(groupedGames);
      } else if ($(stanza).attr("type") == 'error') {
        alert("Error when fetching rooms list");
      };
      return true;

    };
    jabber.client.connection.addHandler(disco_items_callback, 'jabber:client', 'iq', null, query_id, null);
    console.log("disco_items_iq sent")
    jabber.client.connection.send(queryIq.tree());
  },


  join_game_iq: function(slug, isJoin) {
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
      'to': slug + "@" + jabber.client.gameNode,
      'from': jabber.client.connection.jid,
      'id': command_id,
      'type': 'set'
    })
      .c('command', command_attrs)
      .c('x', {'xmlns': 'jabber:x:data', 'type': 'submit'})

    game_status_callback = function(stanza){
      console.log("game_status_callback triggered. stanza --> ");
      console.debug(stanza);
      if ($(stanza).find("countdown").size() > 0) {   //<countdown time="30">Game is about to start. Please wait for other players to join.</countdown>
        var time = $(stanza).find("countdown").attr("secs");
        $('div#gamefield div#pregamepad div#waitmessage h1').html( time + ' secs.');
        $('div#gamefield div#pregamepad div#waitmessage').show();
      } else if ($(stanza).find("status").size() > 0) {   //<status question='9' total='20' players='99' />
        var question = $(stanza).find("status").attr("question");
        var total = $(stanza).find("status").attr("total");
        var players = $(stanza).find("status").attr("players");
        $('div#gamefield div#gameinfo span#question-info').html( 'Question ' + question + ' / ' + total );
        $('div#gamefield div#gameinfo span#players-info').html( players + ' Players');
      };
      
      return true;
    };

    game_question_callback = function(stanza){
      console.log("game_question_callback triggered. stanza --> ");
      console.debug(stanza);
      $('div#gamefield div#pregamepad').hide();
      $('div#gamefield div#gamepad').show();
      $('div#optionspad div.optionblock').removeClass("selected right hit fail");
      $('div#optionspad div.optionblock').disabled = true;
      var question = $(stanza).find('question').text();
      var time = parseInt($(stanza).find('question').attr('time'));
      var option1 = $(stanza).find('answers answer#1').text();
      var option2 = $(stanza).find('answers answer#2').text();
      var option3 = $(stanza).find('answers answer#3').text();
      var option4 = $(stanza).find('answers answer#4').text();
      $('div#gamefield div#gamepad div#questionpad p#questiontext').html(question);
      $('div#gamefield div#gamepad div#optionspad div#option1 p#option1-text').html(option1);
      $('div#gamefield div#gamepad div#optionspad div#option2 p#option2-text').html(option2);
      $('div#gamefield div#gamepad div#optionspad div#option3 p#option3-text').html(option3);
      $('div#gamefield div#gamepad div#optionspad div#option4 p#option4-text').html(option4);

      //Restore and launch timer at 100%
      $('div#gamefield div#gamepad #timebar-outer').removeClass('timeout');
      $('div#gamefield div#gamepad #timebar-inner').removeClass('overtime');
      $('div#gamefield div#gamepad #timebar-inner').attr('style', 'width:100%;');

      jabber.client.responseStatus = 'Clear'

      var count = time;
      var counter = setInterval(timer, 1000); //1000 will  run it every 1 second

      function timer()
      {
        count -= 1;
        if (count <= 0)
        {
           clearInterval(counter);
           //counter ended, do something here
           $('div#gamefield div#gamepad #timebar-inner').attr('style', 'width:0%;');
           if (jabber.client.responseStatus == 'Clear') {
              $('div#gamefield div#gamepad #timebar-outer').addClass('timeout');
              $('div#optionspad div.optionblock').attr("enabled", false);
              jabber.client.responseStatus == 'Timeout'
           };
           return;
        }
        progress = (count / time) * 100
        $('div#gamefield div#gamepad #timebar-inner').attr('style', 'width:' + progress + '%;');
      }

      
      //Enable options interaction
      $('div#optionspad div.optionblock').attr("enabled", true);

      jabber.client.questionId = $(stanza).attr("id");
      jabber.client.questionTimestamp = new Date().getTime();


      //Add options handler (player response send)
      $('div#optionspad div.optionblock').bind('click', function() {

        if (jabber.client.responseStatus == 'Clear') {
          $('div#optionspad div.optionblock').attr("enabled", false);
          $('div#gamefield div#gamepad #timebar-inner').addClass('overtime');
          $(this).addClass("selected");

          var id = $(this).attr("id");
          var optionNum = id.slice(6,7);
          var responseTime = new Date().getTime() - jabber.client.questionTimestamp;
          console.debug("Player response - option -> " + optionNum + " -- Time -> " + responseTime);

          var stanza_id = jabber.client.questionId;
          // var stanza_attrs = {
          //     'xmlns': 'http://jabber.org/protocol/commands',
          //     'node' : event_node,
          //     'action' : 'execute'
          // };

          var responseMessage = $msg({
            'from': jabber.client.connection.jid,
            'to': jabber.client.gameJid,
            'id': stanza_id,
            'type': 'answer'
          }).c('answer', {id: optionNum, time: responseTime})

          jabber.client.answerId = parseInt(optionNum);
          jabber.client.responseStatus = 'Responded'
          jabber.client.connection.send(responseMessage.tree());
          console.debug("Player response sent! option -> " + optionNum);
        } else {
          console.debug("Action ignored. Already responded.");
        };
      });

      return true;
    };

    game_reveal_callback = function(stanza) {

      console.log("game_reveal_callback triggered. stanza --> ");
      console.debug(stanza);
      
      var question = $(stanza).find('option').attr('question');
      var id = parseInt($(stanza).find('option').attr('id'));
      var rightSelector = "option" + id;
      var selectedSelector = "option" + jabber.client.answerId;

      $('div#optionspad div.optionblock').removeClass("selected");
      console.log("Right answer was... " + id);

      var rightElementPath = 'div#optionspad div#' + rightSelector;
      var selectedElementPath = 'div#optionspad div#' + selectedSelector;
      
      if (jabber.client.answerId != null){
        if (id == jabber.client.answerId){
          console.log("You were RIGHT!!");
          $(selectedElementPath).addClass("hit");
        } else {
          console.log("You bastard LOSER!");
          $(selectedElementPath).addClass("fail");
          //reveal right answer
          $(rightElementPath).addClass("right");
        };
      } else {
        //reveal right answer
        $(rightElementPath).addClass("right");
      };

      jabber.client.answerId = null;

      return true;
    };

    game_ranking_callback = function(stanza) {
      console.log("game_ranking_callback triggered. stanza --> ");
      console.debug(stanza);

      var rankingType = $(stanza).children('rank').attr('type'); //<rank type='question' count='1' total='5'>
      var count = $(stanza).children('rank').attr('count');
      var total = $(stanza).children('rank').attr('total');

      if (rankingType == 'question'){
        console.log("Ranking type received: Question");
        //Tab switch
        $('main#roomview div#rankingsview div#tabswrapp div.tab.tableft').removeClass('active');
        $('main#roomview div#rankingsview div#tabswrapp div.tab.tabright').addClass('active');
        $('main#roomview div#rankingsview div#tablewrapp').empty();
        $('main#roomview div#rankingsview div#tablewrapp').append('<table id="questionrank"> </table>');

        $(stanza).find('rank').find('player').each(function(playerIndex){
          var pos = $(this).attr('pos');
          var nickname = $(this).attr('nickname');
          var time = $(this).attr('time');
          var score = $(this).attr('score');
          $('main#roomview div#rankingsview div#tablewrapp table#questionrank').append(
              '<tr> \
                <td>' + pos + '</td> \
                <td>' + nickname + '</td> \
                <td>' + time + '</td> \
                <td>' + score + '</td> \
              </tr>'
          );
        });
      } else if (rankingType == 'game'){
        console.log("Ranking type received: Game");
        try {
          // Tab switch
          $('main#roomview div#rankingsview div#tabswrapp div.tab.tabright').removeClass('active');
          $('main#roomview div#rankingsview div#tabswrapp div.tab.tableft').addClass('active');

          clearQuestion();

          $('main#roomview div#rankingsview div#tablewrapp').empty();
          $('main#roomview div#rankingsview div#tablewrapp').append('<table id="scoreboard"> </table>');

          $(stanza).find('rank').find('player').each(function(playerIndex){
            //var pos = player.attr('pos');
            var nickname = $(this).attr('nickname');
            var time = $(this).attr('time');
            var score = $(this).attr('score');
            $('main#roomview div#rankingsview div#tablewrapp table#scoreboard').append(
                '<tr> \
                  <td>' + nickname + '</td> \
                  <td>' + score + '</td> \
                </tr>'
            );
          });
        }
        catch(e) {
          console.error('While processing Scoreboard message ==> ' + e )
        };
      };
      return true;
    };


    join_game_callback = function(stanza) {
      var command = $(stanza).find('command');
      if (command.attr("status") == "completed") {
        var returniq = command.find('x item');
        var r = returniq.attr("return");
        var d = returniq.attr("desc");
        console.log("Join Game Completed!");

        // Hide pregamepad and prepare to get questions
        //$('div#gamefield div#pregamepad submit').hide();
        $('div#gamefield div#pregamepad button#join-submit').hide();
        $('div#gamefield div#pregamepad div#waitmessage').show();
        $('div#gamefield div#pregamepad div#waitmessage h2').html('Waiting for next question...');
        $('div#gamefield div#pregamepad div#waitmessage h1').empty();

        // Add game handlers
        var gameJid = jabber.client.roomSlug + "@" + jabber.client.gameNode + "/" + jabber.client.roomSlug
        console.log("Adding handlers for JID " + gameJid);
        jabber.client.gameJid = gameJid;
        jabber.client.gameStatus = 'onGame';
        jabber.client.connection.addHandler(game_status_callback, 'jabber:client', 'message', 'status', null, gameJid);
        jabber.client.connection.addHandler(game_question_callback, 'jabber:client', 'message', 'question', null, gameJid);
        jabber.client.connection.addHandler(game_reveal_callback, 'jabber:client', 'message', 'reveal', null, gameJid);
        jabber.client.connection.addHandler(game_ranking_callback, 'jabber:client', 'message', 'ranking', null, gameJid);

      } else {
        var returniq = command.find('x item');
        console.error("JOIN GAME ERROR! -- " + "returniq -> " + stanza);
      };
      return true;
    };


    console.debug( "Sending join_game to room -> " + slug);

    jabber.client.connection.addHandler(join_game_callback, 'jabber:client', 'iq', 'result', command_id, null);
    jabber.client.connection.send(commandIq.tree());
  },

  // Chat callbacks

  join_muc_iq: function(roomSlug, roomName){
    var self = this;
    console.log("Joining room.... (" + roomName + ") " + roomSlug + '@' + this.mucNode);
    try{
      jabber.client.connection.muc.join(roomSlug + '@' + this.mucNode, jabber.client.nickname, self.onMucMessage,  self.onMucPresence, self.onMucRoster);
      console.log("Joined successfully");
      jabber.client.roomSlug = roomSlug;
      jabber.client.roomName = roomName;
      jabber.client.mucJid = jabber.client.roomSlug + "@" + jabber.client.mucNode;
      jabber.client.gameStatus = 'onMuc';
      $("main#hallroom").hide();
      $("main#roomview span.roomname").html(roomName);
      $("main#roomview button#join-submit").html('Join Game')
      $("main#roomview button#join-submit").disabled = false;
      $("main#roomview").show();

      //enable chat sending by hitting enter key
      $("#chatinput").on("keydown", 
        function(e) {
          if (e.which == 13) {
            e.preventDefault();
            console.log("keydown: enter");
            console.info("Text: " + $("#chatinput").val());
            // Compose and send chat stanza
            rndId = new Date().getTime();
            var chatMessage = $msg({
            'from': jabber.client.connection.jid,
            'to': jabber.client.mucJid,
            'id': 'chat-' + rndId,
            'type': 'groupchat'
            }).c('body', {}, $("#chatinput").val());

            chatMessage.c('nick', {'xmlns':"http://jabber.org/protocol/nick"}, jabber.client.nickname);
            jabber.client.connection.send(chatMessage.tree());
            console.debug("Chat message sent -> " + chatMessage);
            $("#chatinput").val('');

          };
        }
      );

      //add bind for join room button
      $("main#roomview button#join-submit").bind('click', function() {
        var name = $(this).html();
        //var slug = $(this).attr("slug")
        console.debug( "Calling Join Game - slug -> " + roomSlug);
        $("main#roomview button#join-submit").html('Joining...');
        $("main#roomview button#join-submit").disabled = true;
        jabber.client.join_game_iq(roomSlug, true);
      });
    }
    catch(e){
      console.error("Error while joining room. - " + roomSlug + '@' + this.mucNode + ": " + e.text);
      alert("Error while joining room. - " + roomSlug + '@' + this.mucNode + ": " + e.text)
    }
  },
  onMucMessage: function(message){
    try {
      var self = this;
      var body = $(message).find("body").text();
      var nick = $(message).find("nick").text();
      console.info(nick + '> ' + body);
      var lineBuffer = ' \n' + nick + ' > ' + body;
      console.info("New line chat: " + lineBuffer);
      var chatBuffer = $("main#roomview div#mainwrap div#chatview textarea#chattext").text() + lineBuffer;
      console.info("Printing in chat: " + chatBuffer);
      $("main#roomview div#mainwrap div#chatview textarea#chattext").text(chatBuffer);
        //Chatarea Autoscroll
      var textarea = document.getElementById('chattext');
      textarea.scrollTop = textarea.scrollHeight;
      return true;
    } catch(e) {
      console.error('Exception while processing chatgroup message ==> ' + e );
    };

  },
  onMucPresence: function(presence){
      console.log("onPresence");
      console.log(presence);
      return true;
  },
  onMucRoster: function(roster){
      console.log("onRoster");
      console.log(roster);
      // Render MUC Roster if not playing
      if (jabber.client.gameStatus == 'onMuc') {

      };
      return true;
  }

}; // end jabber.client


function clearQuestion(){
  $('div#gamefield div#gamepad div#optionspad div.optionblock').removeClass("selected right hit fail");
  $('div#gamefield div#gamepad div#questionpad p#questiontext').html(null);
  $('div#gamefield div#gamepad div#optionspad p.option-text').html(null);
};


function processLoginForm(e) {
    if (e.preventDefault) e.preventDefault();

     if (jabber.client.connection) {
       jabber.client.disconnect();
       $("#login-submit").html("Connect");
     } else {
       console.log('Connecting...');
       $("#login-submit").disabled = true;
       $("#login-submit").html("Connecting...");
       var chatjid = $("#login-username").val();
       var password = $("#login-password").val();
       jabber.client.connect(chatjid, password);
     }
  
    // You must return false to prevent the default form behavior
    return false;
}


function processRoomList(roomList) {

  // Clean room list before updating
  $("div#roomlisting").empty();

  roomList.find("games").each(function(gamesGroup) {
    console.log("Rooms Group(" + gamesGroup + ") - " + $(this).attr("group"))
    
    // <div class="tableheader">
    //   <p>TRIAL ROOMS</p>
    // </div>

    // <ul class="roomlist">
    //   <li>

    $("div#roomlisting").append('<div class="tableheader"><p>' + $(this).attr("group") + '</p></div>');
    $("div#roomlisting").append('<ul id="group-' + gamesGroup + '" class="roomlist">');

    $(this).find("game").each(function(game) {
      console.debug( "Room - " + $(this).attr("name") + " --> " + $(this) + " - slug - " + $(this).attr("slug") + " - jid - " + $(this).attr("jid"))

        //     <span class="rowroom">
        //       <span class="roomname"><a href="#">TriviaRoom</a></span>
        //       <span class="roomtopic">Miscelanea</span>
        //       <div class="roomdata">
        //         <span class="roomquestions ">5/20</span>
        //         <span class="roomnumplayers">28</span>
        //       </div>
        //     </span>

        $("div#roomlisting ul#group-" + gamesGroup).append(
                                     '<li> \
                                        <span class="rowroom"> \
                                          <span class="roomname"><a href="#" slug="' +  $(this).attr("slug") + '">' + $(this).attr("name") + '</a></span> \
                                          <span class="roomtopic">' + $(this).attr("topic") + '</span> \
                                          <div class="roomdata"> \
                                            <span class="roomquestions ">' + $(this).attr("question") + '/' + $(this).attr("questions") + '</span> \
                                            <span class="roomnumplayers">' + $(this).attr("players") + '</span> \
                                          </div> \
                                        </span> \
                                      </li> \
                                    ');

    });
    //   </li>
    // </ul>
    $("div#roomlisting").append('</ul>');
  });

  // Add handler and room join
  $("div#roomlisting span.roomname a").bind('click', function() {
    // var slug = $(this).attr("jid").split('@')[0] // Converts jid to Slug
    var slug = $(this).attr("slug");
    var name = $(this).html();
    console.debug("Join Room - slug -> " + slug + " -- name -> " + name);
    jabber.client.join_muc_iq(slug, name);
  });

}


function addLoginHandlers(){
  var form = document.getElementById("login-form");
  if (form.attachEvent) {
    form.attachEvent("submit", processLoginForm);
  } else {
    form.addEventListener("submit", processLoginForm);
  };
}


$(document).ready(function(){
  jabber.client.init();
  addLoginHandlers();
});

window.onbeforeunload=function(){
  jabber.client.disconnect();
};