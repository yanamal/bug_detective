event_cache = []  //list of logged events (that have not been sent over to the server yet)

// Initialize page_data if not already defined
if (typeof page_data === 'undefined') {
    page_data = {
        url: window.location.href,
        pathname: window.location.pathname,
        page_title: document.title
    };
}

function get_attrs(el) {
    attrs = {}
    for (a of el.attributes) {
        if(a.specified) {
            attrs[a.name]=a.value
        }
    }
    return attrs
}

// add logging for clicks on certain elements
function log_clicks(selector) {
    console.log($(selector))
    $(selector).on('mouseup', function (e){
        e.stopPropagation(); // prevent parent elements from logging this event

        event_cache.push({
            timestamp: new Date().getTime(),
            event_type: 'click',
            selector: selector,
            id: e.target.id,
            attributes: get_attrs(e.target),
            page_data: page_data
        })

        console.log(event_cache.slice(-1)[0])
        // console.log(JSON.stringify(event_cache.slice(-1)[0]))
    })
}


// add logging for hovers on certain elements
const hover_threshold = 100  // ms
function log_hovers(selector) {
    console.log($(selector))
    $(selector).mouseover(function(e){
        e.stopPropagation();
        //console.log(e.target)
        //console.log(this)

        $(this).data('hover_start', new Date().getTime())
    })
    $(selector).mouseout(function(e){
        e.stopPropagation();
        const duration = ( new Date().getTime() - $(this).data('hover_start') )
        if(duration >= hover_threshold) {
            event_cache.push({
                timestamp: new Date().getTime(),
                event_type: 'hover',
                selector: selector,
                id: this.id,
                attributes: get_attrs(this),
                text: this.textContent,
                duration: duration,
                page_data: page_data
            })

            console.log(event_cache.slice(-1)[0])
        }
    })
}


// log custom event (e.g. value change)
function log_custom_event(event_type, event_data) {
    event_cache.push({
        timestamp: new Date().getTime(),
        event_type: event_type,
        data: event_data,
        page_data: page_data
    })

    console.log(event_cache.slice(-1)[0])
}


// send event logs to server (and empty cache)
function send_logs(){
    flush_keylog();  // ensure that we get all the keystrokes that were logged before this send event
    $.ajax({
    type: "POST",
    url: "/log_interactions",
    data: JSON.stringify(addIdentifier({
        logs: event_cache
    })),
    contentType: "application/json",
    dataType: 'json',
    success: function(result) {
        console.log(result);
        event_cache = []
    }
    })
}


// Set up certain types of events that should always be logged

// Log copy events
document.addEventListener('copy', function(e) {
    const selectedText = window.getSelection().toString();

    event_cache.push({
        timestamp: new Date().getTime(),
        event_type: 'copy',
        selected_text: selectedText,
        page_data: page_data
    });

    console.log(event_cache.slice(-1)[0]);
});

// Log paste events
document.addEventListener('paste', function(e) {
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    
    event_cache.push({
        timestamp: new Date().getTime(),
        event_type: 'paste',
        pasted_text: pastedText,
        page_data: page_data
    });

    console.log(event_cache.slice(-1)[0]);
});

// log visibility change events:
// These seem to be triggered when the user activates/deactivates the particular page in any way.
// This includes switching to a different tab/window, loading the page the first time, and navigating away from the page(?)
// TODO: this seems to cover switching to a new **tab** in the same window, but not switching to a different active **window**
document.addEventListener("visibilitychange", function logData() {
    if (document.visibilityState === "hidden") {
        log_custom_event("navigate_away", {})
        send_logs() // send the logs right away, in case we're loading a different page and everything will be lost
    }
    else {
        log_custom_event("navigate_to", {})
    }
});

// Debounced keylogger
let keylog_buffer = '';
let keylog_first_timestamp = null;
let keylog_last_timestamp = null;
let keylog_target = null;
let keylog_timeout = null;
const KEYLOG_DEBOUNCE_MS = 500;

function flush_keylog() {
    if (keylog_buffer.length > 0) {
        const target_info = {};
        if (keylog_target) {
            if (keylog_target.id) target_info.id = keylog_target.id;
            if (keylog_target.className) target_info.class = keylog_target.className;
            target_info.tag = keylog_target.tagName;
        }

        event_cache.push({
            timestamp: keylog_first_timestamp,
            event_type: 'keylog',
            typed_text: keylog_buffer,
            first_keypress: keylog_first_timestamp,
            last_keypress: keylog_last_timestamp,
            duration_ms: keylog_last_timestamp - keylog_first_timestamp,
            target: target_info,
            page_data: page_data
        });

        console.log(event_cache.slice(-1)[0]);

        // Reset the buffer
        keylog_buffer = '';
        keylog_first_timestamp = null;
        keylog_last_timestamp = null;
        keylog_target = null;
    }
}

document.addEventListener('keydown', function(e) {
    const timestamp = new Date().getTime();

    // Clear existing timeout
    if (keylog_timeout) {
        clearTimeout(keylog_timeout);
    }

    // Record first timestamp if this is a new sequence
    if (keylog_buffer.length === 0) {
        keylog_first_timestamp = timestamp;
        keylog_target = e.target;
    }

    // Update last timestamp
    keylog_last_timestamp = timestamp;

    // Add the key to the buffer (only if it's a printable character)
    if (e.key.length === 1) {
        keylog_buffer += e.key;
    } else if (e.key === 'Backspace') {
        keylog_buffer += '[Backspace]';
    } else if (e.key === 'Enter') {
        keylog_buffer += '[Enter]';
    } else if (e.key === 'Tab') {
        keylog_buffer += '[Tab]';
    }

    // Set new timeout to flush after debounce period
    keylog_timeout = setTimeout(flush_keylog, KEYLOG_DEBOUNCE_MS);
});


// Auto-send logs every minute (only if there are new logs)
let last_sent_count = 0;
setInterval(function() {
    if (event_cache.length > 0 && event_cache.length !== last_sent_count) {
        last_sent_count = event_cache.length;
        send_logs();
    }
}, 60000); // 60000ms = 1 minute
