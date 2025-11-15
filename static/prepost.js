let timer_interval;
$(document).ready(function() {
    // Crete dialog for "no AI use" warning
    $('#no_ai').dialog({
        autoOpen: false,
        minWidth: 800,
        modal: true,
        buttons: [
            {
                text: "I will not use external AI tools",
                click: function() {
                    $( this ).dialog( "close" );
                }
            }
        ]
    })
    // If this is not the end test (so this IS the pre-test), open the dialog.
    if(!urlParams.has('end')) {
        $('#no_ai').dialog('open');
    }

    log_hovers('td')
    log_clicks('button')

    // Turn read-only buggy code into ace format
    let scode = ace.edit("buggycode", {
        maxLines: 7,
        fontSize: 14,
        theme: "ace/theme/github",
        mode: "ace/mode/python",
        readOnly: true,
        showPrintMargin: false,
        highlightActiveLine: false,
        highlightGutterLine: false
    });
    scode.clearSelection();
    scode.renderer.$cursorLayer.element.style.display = "none";

    // Turn editable code block into ace editor
    let ucode = ace.edit("usercode", {
        maxLines: 10,
        fontSize: 14,
        theme: "ace/theme/dawn",
        mode: "ace/mode/python",
    });
    ucode.clearSelection();
    ucode.focus();

    // Run unit tests for original code
    test_code(false, true)

    // set up timer
    let seconds_left = 10*60
    timer_interval = setInterval(function() {
        seconds_left -= 1
        $('#timer').text(Math.floor(seconds_left/60)+':' + (seconds_left%60).toLocaleString('en-US', {minimumIntegerDigits: 2, useGrouping:false}))

        if(seconds_left <= 60) {
            $('#timer').css('color', 'red')
        }

        if(seconds_left <= 0) {
            clearInterval(timer_interval);
            log_custom_event('debugging_timeout', {})
            reveal_questions()
        }
    }, 1000)

    // Handle post-debug questions submission
    $('#submit_questions').click(function() {
        const answers = addIdentifier({
            bug_desc: $('#question1').val(),
            how_caused_output: $('#question2').val(),
            questions_asked: $('#question3').val(),
        });

        log_custom_event('submit_post_debug_questions', answers);
        send_logs();
        // TODO: don't necessarily need the separate post_debug_questions endpoint?

        fetch('/submit_post_debug_questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(answers)
        })
        .then(response => response.json())
        .then(data => {
            if(data.status === 'success') {
                send_logs()

                // Build redirect URL on client side
                const urlParams = new URLSearchParams(window.location.search);
                const params = [];

                // Check for identifier and version params
                if(urlParams.has('identifier')) {
                    params.push('identifier=' + urlParams.get('identifier'));
                }
                // version is actually filled in as part of the template
                params.push('version=' + version);

                // Check for 'end' parameter to redirect elsewhere
                if(urlParams.has('end')) {
                    window.location.href = urlParams.get('end') + (params.length ? '?' + params.join('&') : '');
                } else {
                    window.location.href = '/sequence' + (params.length ? '?' + params.join('&') : '');
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    });
});

function reveal_questions(){
    $('#post_debug_questions').css('display', 'block')
    $('#post_debug_questions')[0].scrollIntoView()
}

function test_code(close_orig=true, insert_actual=false) {
    // Close original buggy code "details" panel to avoid confusion about which one they are editing
    if(close_orig){
        $('#orig_buggy').removeAttr('open')
    }

    // Get unit tests from table
    let unit_tests = []
    $('#unit_tests tr').each(function(index) {
        if(index > 0) { // index 0 is the header row
            unit_tests.push({
                test: $(this).children("td").eq(0).text(),
                expected: $(this).children("td").eq(1).text()
            })
        }
    })


    // log code being tested
    log_custom_event('starting_test', ace.edit($('#usercode')[0]).getValue())

    // Run the unit tests and fetch the results
    fetch('/run_tests', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tests: unit_tests,
            code: ace.edit($('#usercode')[0]).getValue()
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log(data)

        // log results of running test
        log_custom_event('ran_test', data)
        send_logs()

        // insert the actual values and add correct/wrong classes
        $('#unit_tests tr').removeClass() // remove classes (indicating correct/wrong) from all rows
        for(let i=0; i<data.length; i++) {
            this_row = $('#unit_tests tr').eq(i+1)
            // for both return and print output, fade old text out/fade new text in
            this_row.children('td').eq(2).fadeOut(function() {
              $(this).html(`<pre>${data[i]['return_out']}</pre>`).fadeIn();
            });
            this_row.children('td').eq(3).fadeOut(function() {
              $(this).html(`<pre>${data[i]['print_out']}</pre>`).fadeIn();
            });
            //this_row.children('td').eq(2).html(data[i]['return_out'])
            //this_row.children('td').eq(3).html(`<pre>${data[i]['print_out']}</pre>`)
            // TODO: ideally, we would probably compare it in Python somewhere, to catch things like type mismatches.
            //  But this would require actually tracking which problem we're fixing, etc.
            this_row.addClass(data[i]['return_out'] === unit_tests[i].expected ? 'correct-test': 'wrong-test')
        }
        // if insert_actual is specified, then insert the third (failing) test value into the question about how the bad value happened
        // (hacks - the third one is the wrong one in both cases)
        if(insert_actual) {
            $('#test2_output').text(data[2]['return_out'])
        }
        // if there are no wrong test cases, then reveal the follow-up questions
        if($('.wrong-test').length === 0) {
            log_custom_event('debugging_finished', {})
            reveal_questions()
            clearInterval(timer_interval); // also stop timer
        }
    });
}