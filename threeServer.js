/**
 * Created by jfs on 2/23/16.
 */
var express     = require('express'),
   // wait        = require('wait.for'),
   // fs          = require('fs'),
    knox        = require('knox'),
    _           = require('underscore'),
    sio         = require('socket.io'),
    redis       = require('redis'),
    sleep       = require('sleep'),
    Stack       = require('stackjs');
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

var SceneObj = "teapotsLarge";
var bounds;
var haveBounds = false;

var modelStack = new Stack();


/*
app.get('/model/:name', function(req, res) {
    wait.launchFiber(getModel, req, res);
});
*/

getBounds(SceneObj);

function getBounds(name)
{
    var client = knox.createClient({
        key: config.s3.Amazon.key,
        secret: config.s3.Amazon.secret,
        bucket: config.s3.Amazon.bucket,
        endpoint: config.s3.Amazon.endpoint,
        port: config.s3.Amazon.port
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
        camera = msg.frust;
        var cPos = msg.pos;
        checkCamera(cPos, msg, socket, dlIng);
    });
    socket.on('needModels', function(msg)
    {
        for(var i=0; i<msg.length; i++)
        {
            setTimeout(dbModel(msg[i], socket), 0);
        }
    });
});

function checkCamera(cPos, msg, socket, dlIng)
{
    if(!dlIng && lastPos != cPos)
    {
        lastPos = cPos;
        dlIng = true;
        setTimeout(checkModels(cPos, msg, socket, dlIng), 250);
    }
}

function checkModels(cPos, msg, socket, dlIng)
{
    console.log("Got Camera update");
    if(haveBounds)
    {
        var occs = setupOcc(cPos);
        var i = 0;
        var curTime = new Date().getTime();
        while(bounds[''+i] != undefined)
        {
            var modelName = SceneObj+':obj'+i;
            if(occs[i] == false && (containsPoint(msg.frust, bounds[''+i].min) || containsPoint(msg.frust,bounds[''+i].max))
                && downloading[modelName] == undefined)
            {
                //toCheck.push(SceneObj+':obj'+i);
                needed.push(modelName);
                if(clientObjects[modelName] != undefined)
                {
                    clientObjects[modelName]  = curTime
                }
            }
            i++;
        }
        //socket.emit('checkModels', toCheck);
        sendModels(socket);
        setTimeout(checkCamera(cPos, msg, socket, dlIng), 250);
    }
    dlIng = false;
}

var sendingModels = false;

function sendModels(socket)
{
    needed = _.uniq(needed);
    if(needed.length > 0)
    {
        var modelsDownloading = 0;
        console.log("Getting new Model List: " + Math.min(needed.length, maxObj));
        for(var i=0; i< Math.min(needed.length, maxObj); i++)
        {
            var newObj = needed[i];
            if(clientObjects[newObj] == undefined && downloading[newObj] == undefined)
            {
                modelsDownloading++;
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
                downloading[newObj] = true;
                setTimeout(dbModel(newObj, socket, delObj), 0);
            }
            else
            {
                clientObjects[newObj] = new Date().getTime();
            }
        }
        needed = [];
        if(modelsDownloading > 0)
            console.log("Finished model list, downloading models");
        else
            console.log("Client has all models needed");
    }
    else
    {
        console.log("No models needed");
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
                        //console.log("Box " + j + " blocking box " + i + " top");
                        topOcc = true;
                    }

                }
                if(!midOcc) {
                    if(r3.intersects([bounds[''+j].min, bounds[''+j].max]))
                    {
                        //console.log("Box " + j + " blocking box " + i + " middle");
                        midOcc = true;
                    }
                }
                if(!botOcc) {
                    if(r2.intersects([bounds[''+j].min, bounds[''+j].max]))
                    {
                        //console.log("Box " + j + " blocking box " + i + " bottom");
                        botOcc = true;
                    }
                }
            }
        }
        if(topOcc && botOcc && midOcc)
        {
            //console.log("Box " + i + " occluded");
            occluded.push(true);
        }
        else {
            occluded.push(false);
        }
    }
    return occluded;
}

var downloading = {};

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
        var objName = SceneObj+":obj"+i;
        if(clientObjects[objName] != undefined && clientObjects[objName] < lowest &&
            needed.indexOf(objName) == -1)
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
    if(name == undefined) return;
    redisClient.get(name, function(err, data){
       if(err || data == null)
       {
           var client = knox.createClient({
               key: config.s3.Amazon.key,
               secret: config.s3.Amazon.secret,
               bucket: config.s3.Amazon.bucket,
               endpoint: config.s3.Amazon.endpoint,
               port: config.s3.Amazon.port
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
                   {
                       var model = {modelName: name, modelObj: buffer, remove: rem};
                       //socket.emit('getModel', model);
                       modelStack.push(model);
                       if(!sendingModels)
                            sendModelData(socket);
                   }
                   stuff(name, buffer);
                   buffer = '';
                   getting = false;
               })
           }).end();
       } else {
           console.log("Had model " + name + " in redis");
           var model = {modelName: name, modelObj: data, remove: rem};
           modelStack.push(model);
           if(!sendingModels)
               sendModelData(socket);
           //socket.emit('getModel', JSON.stringify({modelName: name, modelObj: data, remove: rem}));
       }
    });
}

function sendModelData(socket)
{
    if(modelStack.size() > 0)
    {
        sendingModels = true;
        var model = modelStack.pop();
        downloading[model.modelName] = undefined;
        socket.emit('getModel', JSON.stringify(model), function(error, message){
            console.log("Success");
        });
        setTimeout(sendModelData(socket), 0);
    }
    else
    {
        sendingModels = false;
    }
}

function stuff(uri, obj)
{
    redisClient.set(uri, obj);
}

var server = http.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});