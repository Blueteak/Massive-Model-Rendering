
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 3000 );
var renderer = new THREE.WebGLRenderer();
//var cameraControls = new THREE.OrbitControls(camera, renderer.domElement);
var cameraControls = new THREE.FirstPersonControls(camera, renderer.domElement);
var clock = new THREE.Clock();

var rendererStats   = new THREEx.RendererStats();
rendererStats.domElement.style.position = 'absolute';
rendererStats.domElement.style.left = '0px';
rendererStats.domElement.style.bottom   = '0px';
document.body.appendChild( rendererStats.domElement );

init();

function init()
{
    renderer.setSize( window.innerWidth, window.innerHeight);
    document.body.appendChild( renderer.domElement );
    var directionalLight1 = new THREE.DirectionalLight( 0xffffff, 0.5 );
    directionalLight1.castShadow = true;
    directionalLight1.position.set(-60, 80, 100);
    directionalLight1.shadowCameraVisible = true;
    directionalLight1.shadowCameraNear = 100;
    directionalLight1.shadowCameraFar = 200;
    directionalLight1.shadowCameraLeft = -20; // CHANGED
    directionalLight1.shadowCameraRight = 20; // CHANGED
    directionalLight1.shadowCameraTop = 20; // CHANGED
    directionalLight1.shadowCameraBottom = -20; // CHANGED
    var light = new THREE.AmbientLight( 0x404040 ); // soft white light
    scene.add( light );
    scene.add( directionalLight1 );
    scene.add( new THREE.DirectionalLightHelper(directionalLight1, 0.2) );
    renderer.shadowMapEnabled = true;
    renderer.shadowMapSoft = false;


    var geometry = new THREE.SphereGeometry( 2000, 32, 32 );
    var skyMap = THREE.ImageUtils.loadTexture( 'images/sky.png' );
    var material = new THREE.MeshBasicMaterial( {map: skyMap} );
    material.side = THREE.BackSide;
    var sphere = new THREE.Mesh( geometry, material );
    sphere.name = "SkyBox";
    scene.add(sphere);

    console.log(camera);

    camera.position.z = 3;
    cameraControls.lookVertical = true;

    /*
    cameraControls.target.set( 0, 0, 0);
    cameraControls.maxDistance = 30;
    cameraControls.minDistance = 10;
    cameraControls.update();
    */
}

var socket = io();

var modelCache = {};

/*
loader.load(
    // resource URL
    '/model/teapot3.obj',
    // Function when resource is loaded
    function ( object ) {
        object.name = "tpot";
        object.children[1].geometry.computeBoundingSphere();
        scene.add( object );
    }
);
*/

var cameraPos;
var cameraRot;

var maxObjects = 100;

function render()
{
    rendererStats.update(renderer);
    cameraControls.update(clock.getDelta());
    requestAnimationFrame( render );
    renderer.render( scene, camera );
    //console.log(camera.position + ' - ' + camera.rotation);
    if(cameraPos != JSON.stringify(camera.position) || cameraRot != JSON.stringify(camera.rotation))
    {
        var frustum = new THREE.Frustum();
        var projScreenMatrix = new THREE.Matrix4();
        projScreenMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
        frustum.setFromMatrix( new THREE.Matrix4().multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ));
        var camObj = {frust: frustum, pos: camera.position};
        socket.emit('updateCamera', camObj);
        cameraPos = JSON.stringify(camera.position);
        cameraRot = JSON.stringify(camera.rotation);
    }
}


socket.on('boundingBoxes', function(msg){
    console.log("Got Bounding Boxes");
    for(var i=0; i<msg.length; i++)
    {
        bound = msg[i];
        var geometry = new THREE.BoxGeometry(bound.max[0]-bound.min[0], bound.max[1]-bound.min[1], bound.max[2]-bound.min[2]);
        var material = new THREE.MeshBasicMaterial( {color: 0x00ff00} );
        var cube = new THREE.Mesh( geometry, material );
        cube.position.set((bound.max[0]+bound.min[0])/2,(bound.max[1]+bound.min[1])/2,(bound.max[2]+bound.min[2])/2);
        var box = new THREE.BoxHelper(cube);
        scene.add( box );
    }
});


socket.on('checkModels', function(msg)
{
    var needed = [];
    for(var i = 0; i< msg.length; i++)
    {
        if(modelCache[msg[i]] == undefined)
        {
            console.log("Need model: " + msg[i] + " - Requesting");
            modelCache[msg[i]] = {val: "Getting Model", used: new Date().getTime()};
            needed.push(msg[i]);
            socket.emit('needModel', msg);
        }
        else
        {
            modelCache[msg[i]].used = new Date().getTime();
        }
    }
    if(needed.length > 0)
        socket.emit('needModels', needed);
});

function checkCache()
{
    var curKeys = 0;
    for(var p in modelCache)
    {
        if(modelCache.hasOwnProperty(p))
        {
            curKeys++;}
    }
    if(curKeys > maxObjects)
    {
        var lowKey = "";
        var lowTime = new Date().getTime();
        for(var o in modelCache)
        {
            if(modelCache.hasOwnProperty(o))
            {
                if (modelCache[o].used < lowTime)
                {
                    lowTime = modelCache[o].used;
                    lowKey = o;
                }
            }
        }

        delete modelCache[lowKey];
        var selectedObject = scene.getObjectByName(lowKey);
        if(selectedObject) {
            scene.remove(selectedObject);
            selectedObject.geometry.dispose();
            selectedObject.material.dispose();
            selectedObject.geometry = undefined;
            selectedObject.material = undefined;
            selectedObject = undefined;
            console.log("Removed: " + lowKey);
        }
        else
        {
            console.log("Dropping: " + lowKey);
            //dropped[lowKey] = "Dropped";
        }

    }
}

var dropped = {};

socket.on('getModel', function(msg)
{
    msg = JSON.parse(msg);
    if(msg.remove.length > 2)
    {
        delete modelCache[msg.remove];
        var selectedObject = scene.getObjectByName(msg.remove);
        if(selectedObject) {
            scene.remove(selectedObject);
            selectedObject.geometry.dispose();
            selectedObject.material.dispose();
            selectedObject.geometry = undefined;
            selectedObject.material = undefined;
            selectedObject = undefined;
            console.log("Removed: " + msg.remove);
        }
    }
    if(dropped[msg.modelName] == undefined)
    {
        console.log("Got new Model: " + msg.modelName);
        modelCache[msg.modelName] = {val: "Got Model", used: new Date().getTime()};
        checkCache();
        loadModel(msg);
    }
    else
    {
        delete modelCache[msg.modelName];
        delete dropped[msg.modelName];
    }

});

function loadModel(msg)
{
    var m = JSON.parse(msg.modelObj);
    //TestObj
    var geom = new THREE.Geometry();
    for(var i = 0; i< m.v.length; i++)
    {
        geom.vertices.push(new THREE.Vector3(m.v[i][0],m.v[i][1],m.v[i][2]));
    }
    for(var j = 0; j< m.f.length; j++)
    {
        geom.faces.push(new THREE.Face3(m.f[j][0], m.f[j][1], m.f[j][2]));
    }
    geom.computeFaceNormals();
    geom.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial();
    //mat.side = THREE.DoubleSide;
    var newObject = new THREE.Mesh( geom, mat );
    newObject.name = msg.modelName;
    newObject.castShadow = true;
    newObject.receiveShadow = true;
    scene.add(newObject);
}

render();

