var http = require("http"),
    mongojs = require("mongojs"); 

var moment = require('moment');

var uri = 'localhost:27017/RemindMe';
var db = mongojs.connect(uri, ["tweets"]);

var server = http.createServer(function(request, response) {
	response.writeHead(200, {"Content-Type": "text/html"});

        var html = '<h1>Tweets!</h1>';
        var count = 0;        

        db.tweets.find().sort({reminder_time: 1}).forEach(function(err, tweet) {
	    if(err) {
                console.log("There was an error executing the database query.");
                response.end();
                return;
            }
            
            if (!tweet) {
                html += '<h2><b>Number of tweets:</b> ' + count  + '</h2>';
                response.write(html);
                response.end();
                return;
            }
           
            count++;
 
            var user = tweet.user.screen_name;

            html += '<p>';
               
            var timeToReminder = new Date(tweet.reminder_time - Date.now());
            html += ((timeToReminder.getDay()-4)*24 + timeToReminder.getHours()) + ':' + timeToReminder.getMinutes() 
                       + ':' + timeToReminder.getSeconds();

            html += ' <b>@' + user + ':</b> ' + tweet.text; 
               

            html += ' <a href=\"http://twitter.com/' + user + '/status/' + tweet.id_str + '\"> Tweet </a>'; 
            html += '<br> -  -  -  -  -  - '
            html += ' <b>UTC Offset:</b> ' + tweet.user.utc_offset;

            html += ' <b>Created At:</b> ' + tweet.created_at;

            var reminder = new Date(tweet.reminder_time);

            html += ' <b>Reminder At:</b> ' + reminder.toUTCString();

            html += '</p>';   
        });
});

server.listen(3000);

var Twit = require('twit')

var T = new Twit({
    consumer_key:         'FOHJfcWiJE2tFBGrZtqMM4wIh'
  , consumer_secret:      'n9NZQhYKzKJp431hIdlorNKLYWKVgNIElBIaE4sQ71pbyBa82K'
  , access_token:         '2885734899-Ib3OdFxDaCSW3o31FoVuQpDcc2B6LisYAzF9LVK'
  , access_token_secret:  'RSXkSuF0NbvVIhTcCD64YnE0TvWCJbcfSuTYiD7FOutYP'
})


var stream = T.stream('statuses/filter', { track: 'someone remind me to tomorrow, somebody remind me to tomorrow, RemindMeBot_ remind me to' })

stream.on('tweet', function (tweet) {
    console.log('@' + tweet.user.screen_name + ': ' + tweet.text);
    
    if (tweet.text.indexOf('RT') > -1) {
      return;
    }

    var reminderTime = new Date(tweet.created_at);

    var day;
 
    if (tweet.text.indexOf('tomorrow') > -1) {
        day = 'tomorrow';
        reminderTime.setTime(reminderTime.getTime() + 19 * 60 * 60 * 1000);
    } else {
        day = 'today';
        reminderTime.setTime(reminderTime.getTime() + 1 * 60 * 60 * 1000);
    }

    tweet.reminder_time = reminderTime.getTime();
    
    var replyString;

    if (tweet.user.utc_offset === null) {
        replyString = ' OK, I\'ll try!';
    } else {
        replyString = ' I\'ll try! What time ' + day + '? (HH:MM 24 hour clock would be great!)';
    }

    T.post('statuses/update', {status: '@' + tweet.user.screen_name + replyString, 
                               in_reply_to_status_id: tweet.id_str}, function(err, data, response) {    
          if (err) {
              console.log(err);
              return;
          }
          
          tweet.botReplyId = data.id_str;
          
          db.tweets.insert(tweet);
    });       
});


var mentions = T.stream('statuses/filter', { track: 'RemindMeBot_' })

mentions.on('tweet', function (tweet) {

    console.log("Mentioned!");
            console.log();
            console.log(tweet);
    
    db.tweets.findOne({botReplyId:tweet.in_reply_to_status_id_str}, function(err, match) {
        if (err) {
            console.log(err);
            return;
        }

        if (match) {
           
            var words = tweet.text.split(' ');
            
            var length = words.length;
            for (var i = 0; i < length; i++) {
                var time = moment(words[i], ['HH:mm', 'HHmm', 'H:mm', 'HH.mm', 'H.mm', 'h:mma', 'h.mma', 'ha'], true);

                if (time.isValid() && match.user.utc_offset !== null) {
                    var offset = parseInt(match.user.utc_offset) * 1000;
                    var reminderTime = new Date(match.reminder_time + offset);

                    reminderTime.setHours(time.hours());
                    reminderTime.setMinutes(time.minutes()); 

                    db.tweets.remove(match);
                    match.reminder_time = reminderTime.getTime() - offset;
                    db.tweets.insert(match);
                    
                    T.post('statuses/update', {status: '@' + tweet.user.screen_name + 
                                                       ' Ok! Your reminder is set for ' + words[i] + '.', 
                               in_reply_to_status_id: tweet.id_str}, function(err, data, response) {    
                        if(err) {
                            console.log(err);
                        }
                    });       
                    
                    break;
                }
            }
        }
    });

});

var sendReminders = function() {
    
        db.tweets.find({reminder_time:{$lte:Date.now()}}).forEach(function(err, tweet) {
	    if(err) {
                console.log("There was an error executing the database query.");
                return;
            }

            if(!tweet) {
               return;
            }
                 
            T.post('statuses/update', 
                        {status: '@' + tweet.user.screen_name + 
                                    ' Here\'s your reminder! Have a great day :)', 
                               in_reply_to_status_id: tweet.id_str}, 
                 function(err, data, response) {
                     if (err) {
                         console.log(err);
                     }
                 });
            db.tweets.remove(tweet);
        });

};

sendReminders();

setInterval(sendReminders, 60000);
