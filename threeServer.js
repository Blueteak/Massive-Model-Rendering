/**
 * Created by jfs on 2/23/16.
 */
var express     = require('express'),
   // wait        = require('wait.for'),
   // fs          = require('fs'),
    knox        = require('knox'),
    _           = require('underscore'),
    sio         = require('socket.io'),
    redis       = require('redis');
var app = express();
var http        = require('http').Server(app);
var io          = require('socket.io')(http);
var Raycast     = require('ray-aabb');
var config      = require('config.json')('./sample.json');

app.use(express.static('public'));
//app.use(bodyParser.urlencoded({ extended: true }));

//Connect Redis
var redisClient = redis.createClient(config.redis.port,config.redis.host);

redisClient.on('ready', function(){
    console.log('Redis Connected');
    //redisClient.flushall();
    redisClient.set('TargValue', 200);
});

var SceneObj = "dragon";
var bounds;
var haveBounds = false;

/*
app.get('/model/:name', function(req, res) {
    wait.launchFiber(getModel, req, res);
});
*/

getBounds(SceneObj);

function getBounds(name)
{
    var client = knox.createClient({
        key: config.s3.Docker.key,
        secret: config.s3.Docker.secret,
        bucket: config.s3.Docker.bucket,
        endpoint: config.s3.Docker.endpoint,
        port: config.s3.Docker.port
    });
    var buffer = '';
    client.get(name+':bounds').on('response', function(res){
        res.setEncoding('utf8');
        res.on('data', function(chunk){
            buffer += chunk.toString();
        });
        res.on('end', function(){
            console.log('Got Bounds');
            bounds = JSON.parse(buffer);
            buffer = null;
            haveBounds = true;
            var i=0;
            while(bounds[''+i] != undefined) {
                i++;
            }
            objLength = i;
        });
    }).end();
}

var objLength = 0;

var getting = false;

var id = "";

var needed = [];
var clientObjects = {};
var maxObj = 100;
var curObj = 0;

var dlIng = false;
var camera = {};

var lastPos = {};

io.on('connection', function(socket){
    console.log('a user connected');
    socket.emit('boundingBoxes', bounds);
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
    socket.on('updateCamera', function(msg)
    {
        var toCheck = [];
        camera = msg.frust;
        var cPos = msg.pos;
        if(!dlIng && lastPos != cPos)
        {
            lastPos = cPos;
            console.log("Got Camera update");
            dlIng = true;
            setTimeout(function()
            {
                if(haveBounds)
                {
                    var occs = setupOcc(cPos);
                    var i = 0;
                    while(bounds[''+i] != undefined)
                    {
                        if(occs[i] == false && containsPoint(msg.frust, bounds[''+i].min || bounds[''+i].max))
                        {
                            //toCheck.push(SceneObj+':obj'+i);
                            needed.push(SceneObj+':obj'+i);
                            if(clientObjects[SceneObj+':obj'+i] != undefined)
                            {
                                clientObjects[SceneObj+':obj'+i]  = new Date().getTime();
                            }
                        }
                        i++;
                    }
                    //socket.emit('checkModels', toCheck);
                    sendModels(socket, msg.position);
                }
                dlIng = false;
            }, 250);
        }
    });
    socket.on('needModels', function(msg)
    {
        for(var i=0; i<msg.length; i++)
        {
            setTimeout(dbModel(msg[i], socket), 0);
        }
    });
});



function sendModels(socket)
{
    if(needed.length > 0)
    {
        for(var i=0; i<needed.length; i++)
        {
            var newObj = needed[i];
            if(clientObjects[newObj] == undefined)
            {
                console.log("need: " + newObj);
                curObj++;
                var delObj = "";
                if(curObj > maxObj)
                {
                    delObj = getLRU();
                    curObj--;
                    console.log("Removing: " + delObj + " for space.");
                    clientObjects[delObj] = undefined;
                }
                clientObjects[newObj] = new Date().getTime();
                setTimeout(dbModel(newObj, socket, delObj), 0);
            }
            else
            {
                clientObjects[newObj] = new Date().getTime();
            }
        }
    }
}

function setupOcc(camPos)
{
    var occluded = [];
    var org = [camPos.x, camPos.y, camPos.z]; var dir = [0,0,0];
    var r1 = Raycast(org, dir);
    var r2 = Raycast(org, dir);
    var r3 = Raycast(org, dir);
    for(var i=0; i<objLength; i++)
    {
        var topOcc = false;
        var midOcc = false;
        var botOcc = false;
        r1.update(org, dirTo(bounds[''+i].min, org));
        r2.update(org, dirTo(bounds[''+i].max, org));
        r3.update(org, dirTo(midPt(bounds[''+i].min, bounds[''+i].max), org));
        for(var j=0; j<objLength; j++)
        {
            if(j != i && (j > occluded.length || occluded[j] == false))
            {
                if(topOcc && botOcc && midOcc) {
                    break;
                }
                if(!topOcc) {
                    if(r1.intersects([bounds[''+j].min, bounds[''+j].max]))
                    {
                        console.log("Box " + j + " blocking box " + i + " top");
                        topOcc = true;
                    }

                }
                if(!midOcc) {
                    if(r3.intersects([bounds[''+j].min, bounds[''+j].max]))
                    {
                        console.log("Box " + j + " blocking box " + i + " middle");
                        midOcc = true;
                    }
                }
                if(!botOcc) {
                    if(r2.intersects([bounds[''+j].min, bounds[''+j].max]))
                    {
                        console.log("Box " + j + " blocking box " + i + " bottom");
                        botOcc = true;
                    }
                }
            }
        }
        if(topOcc && botOcc && midOcc)
        {
            console.log("Box " + i + " occluded");
            occluded.push(true);
        }
        else {
            occluded.push(false);
        }
    }
    return occluded;
}

function midPt(p1, p2)
{
    return [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2, (p1[2]+p2[2])/2];
}


function dirTo(pt, org)
{
    return norm([ pt[0]-org[0], pt[1]-org[1], pt[2]-org[2] ]);
}

function norm(pt)
{
    var mag = Math.sqrt((pt[0] * pt[0]) + (pt[1] * pt[1]) + (pt[2] * pt[2]));
    return [pt[0]/mag, pt[1]/mag, pt[2]/mag];
}

function getLRU()
{
    var lowest = Number.MAX_VALUE;
    var lowKey = "";
    for(var i=0; i<objLength; i++)
    {
        if(clientObjects[SceneObj+':obj'+i] != undefined && clientObjects[SceneObj+':obj'+i] < lowest &&
            needed.indexOf(SceneObj+':obj'+i) > -1)
        {
            lowest = clientObjects[SceneObj+':obj'+i];
            lowKey = SceneObj+':obj'+i;
        }
    }
    return lowKey;
}

function containsPoint(frustum, point)
{
    var planes = frustum.planes;
    for ( var i = 0; i < planes.length; i ++ ) {
        if ( distance(planes[i], point) < 0 ) {
            return false;
        }
    }
    return true;
}

function distance(plane, point)
{
    var p = (plane.normal.x*point[0] + plane.normal.y*point[1] + plane.normal.z*point[2]) + plane.constant;
    return p;
}

function dbModel(name, socket, rem)
{
    redisClient.get(name, function(err, data){
       if(err || data == null)
       {
           var client = knox.createClient({
               key: config.s3.Docker.key,
               secret: config.s3.Docker.secret,
               bucket: config.s3.Docker.bucket,
               endpoint: config.s3.Docker.endpoint,
               port: config.s3.Docker.port
           });
           var buffer = '';
           client.get(name).on('response', function(res)
           {
               res.setEncoding('utf8');
               res.on('data', function(chunk){
                   buffer += chunk.toString();
               });
               res.on('end', function()
               {
                   console.log('Got File: ' + name);
                   if(socket)
                       socket.emit('getModel', JSON.stringify({modelName: name, modelObj: buffer, remove: rem}));
                   stuff(name, buffer);
                   buffer = '';
                   getting = false;
               })
           }).end();
       } else {
           console.log("Had model " + name + " in redis");
           socket.emit('getModel', JSON.stringify({modelName: name, modelObj: data, remove: rem}));
       }
    });


}

function stuff(uri, obj)
{
    redisClient.set(uri, obj);
    console.log("Saving " + uri + " in redis");
}

var server = http.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});