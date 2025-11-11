let timer_interval;
$(document).ready(function() {
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
            reveal_questions()
        }
    }, 1000)

    // Handle post-debug questions submission
    $('#submit_questions').click(function() {
        const answers = {
            bug_desc: $('#question1').val(),
            how_caused_output: $('#question2').val(),
            questions_asked: $('#question3').val()
        };

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
        // insert the actual values and add correct/wrong classes
        $('#unit_tests tr').removeClass() // remove classes (indicating correct/wrong) from all rows
        for(let i=0; i<data.length; i++) {
            $('#unit_tests tr').eq(i+1).children('td').eq(2).html(data[i]['return_out'])
            $('#unit_tests tr').eq(i+1).children('td').eq(3).html(`<pre>${data[i]['print_out']}</pre>`)
            // TODO: ideally, we would probably compare it in Python somewhere, to catch things like type mismatches.
            //  But this would require actually tracking which problem we're fixing, etc.
            $('#unit_tests tr').eq(i+1).addClass(data[i]['return_out'] === unit_tests[i].expected ? 'correct-test': 'wrong-test')
        }
        // if insert_actual is specified, then insert the third (failing) test value into the question about how the bad value happened
        // (hacks - the third one is the wrong one in both cases)
        if(insert_actual) {
            $('#test2_output').text(data[2])
        }
        // if there are no wrong test cases, then reveal the follow-up questions
        if($('.wrong-test').length === 0) {
            reveal_questions()
            clearInterval(timer_interval); // also stop timer
        }
    });
}