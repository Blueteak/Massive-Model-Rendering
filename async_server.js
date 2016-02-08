/* Load System */
/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
var express     = require('express'),
    bodyParser  = require('body-parser'),
    redis       = require('redis'),
    knox        = require('knox'),
    http        = require('http');


var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

var client = knox.createClient({
    key: '00',
    secret: '00',
    bucket: 'testBucket',
    endpoint: '192.168.99.100',
    port: 32769
});

var useStorage = true; //Enable/Disable Usage of external (currently s3) storage

var redisClient = redis.createClient('32768','192.168.99.100');
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
worker();

//Continually scans Redis Q for new models
function worker()
{
    setTimeout(function() {
        worker();
    }, 1000);
    redisClient.brpop('ModelQ', 1, function(err, data) {
        if(err != null)
            console.log(err);
        if(data == null)
            return;
        var model = JSON.parse(data[1]);
    });
}

function setModelInfo(id, perc, started, done)
{
    redisClient.get('Model'+id, function(err, reply)
    {
        if(err)
            console.log(err);
        var modelInfo = JSON.parse(reply);
        modelInfo.started = started;
        modelInfo.done = done;
        modelInfo.percent = perc;
        redisClient.set('Model'+id, JSON.stringify(modelInfo), function(err, reply)
        {
            if(err)
                console.log(err);
        });
    });
}


var server = app.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});