var upload = null;
var stopBtn = $("#stop-btn");
var resumeCheckbox = $("#resume");
var input = $("input[type=file]");
var progress = $("progress");
var progressBar = $("bar");
var alertBox = $("#support-alert");
var chunkInput = $("#chunksize");
var endpointInput = $("#endpoint");

if (!tus.isSupported) {
    alertBox.className = alertBox.className.replace("hidden", "")
}

stopBtn.click(function(e) {
    e.preventDefault()

    if (upload) {
        upload.abort()
    }
});

input.addEventListener("change", function(e) {
    var file = e.target.files[0]
    console.log("selected file", file)

    stopBtn.classList.remove("disabled")
    var endpoint = endpointInput.value
    var chunkSize = parseInt(chunkInput.value, 10)
    if (isNaN(chunkSize)) {
        chunkSize = Infinity
    }

    var options = {
        endpoint: endpoint,
        resume: !resumeCheckbox.checked,
        chunkSize: chunkSize,
        metadata: {
            filename: file.name
        },
        onError: function(error) {
            reset()
            alert("Failed because: " + error)
        },
        onProgress: function(bytesUploaded, bytesTotal) {
            var percentage = (bytesUploaded / bytesTotal * 100).toFixed(2)
            progressBar.style.width = percentage + "%"
            console.log(bytesUploaded, bytesTotal, percentage + "%")
        },
        onSuccess: function() {
            reset()
            var anchor = document.createElement("a")
            anchor.textContent = "Download " + upload.file.name + " (" + upload.file.size + " bytes)"
            anchor.href = upload.url
            anchor.className = "btn btn-success"
            e.target.parentNode.appendChild(anchor)
        }
    }

    upload = new tus.Upload(file, options)
    upload.start()
})

function reset() {
    input.value = ""
    stopBtn.classList.add("disabled")
    progress.classList.remove("active")
}