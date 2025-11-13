// wrap each bit of "naked" text within the code HTML into a span tag, so that they can be picked up by css selectors more easily.
function wrap_text_in_spans(selection, span_class) {
    $('.ast-node', selection).contents().filter(function() {
        return this.nodeType == Node.TEXT_NODE
    }).each(function(){
        let text_span = document.createElement('span')
        text_span.innerHTML=this.textContent
        text_span.className = span_class
        this.parentNode.insertBefore(text_span, this)
        this.parentNode.removeChild(this);
    })
}

// add listeners to all AST nodes to highlight on mouse-over
function highlight_nodes() {
    $('.ast-node').mouseover(function(e)
        {
            e.stopPropagation();
            const node_id = $(this).attr('data-node-id')

            $('.ast-node').removeClass('highlight'); // stop highlighting everything else

            $(`[data-node-id="${node_id}"]`).addClass('highlight');
        });

    $('.ast-node').mouseout(function(e)
        {
            const node_id = $(this).attr('data-node-id')
            $(`[data-node-id="${node_id}"]`).removeClass('highlight');
        });
}

// update the shown value of a particular ast node based on current selection on the execution trace
function update_values_shown(before_pre, after_pre, trace, new_i) {

    $('.code-block .ast-node').removeClass('evaluated-node')
    $('.code-block .ast-node>.value').remove()
    $('.code-block .ast-node>.op-description').remove()

    if(trace[new_i]['before']) {
        let before_node = $(`[data-node-id="${trace[new_i]['before']['node']}"]`, before_pre)
        before_node.addClass('evaluated-node')
        let value_span = $('<span>', {class: "value"}).text(trace[new_i]['before']['values'])
        before_node.prepend(value_span)



        if(trace[new_i]['before']['description']){
            let desc_span = $('<span>', {class: "op-description"}).text(trace[new_i]['before']['description'])
            desc_span.prepend($(`
    <svg class="connector">
      <line x1="-300" y1="10" x2="0" y2="10" stroke="black" stroke-width="1" stroke-dasharray="1,1" />
    </svg>`))
            before_node.prepend(desc_span)

        }
    }

    if(trace[new_i]['after']) {
        let after_node = $(`[data-node-id="${trace[new_i]['after']['node']}"]`, after_pre)
        after_node.addClass('evaluated-node')
        let value_span = $('<span>', {class: "value"}).text(trace[new_i]['after']['values'])
        after_node.prepend(value_span)

        if(trace[new_i]['after']['description']){
            let desc_span = $('<span>', {class: "op-description"}).text(trace[new_i]['after']['description'])
            desc_span.prepend($(`
    <svg class="connector">
      <line x1="-200" y1="10" x2="0" y2="10" stroke="black" stroke-width="1" stroke-dasharray="1,1" />
    </svg>`))
            after_node.prepend(desc_span)

        }
    }

}

// generate the entire debugging view based on the data in the HTML
function generate_view(step_data) {
    let before_pre = $('#before_block')
    let after_pre = $('#after_block')

    let trace_contents = $('<div/>', {class: 'trace-div'})

    // TODO: maybe this doesn't make sense in generate_view if appending directly to body
    $('body').append($(`<span><h2 style="text-align: center;margin-bottom: 1px;">Bug Detective</h2>
        <div style="text-align: center;margin-bottom: 20px;"><i>It is a capital mistake to theorize before you have all the evidence</i> - Sherlock Holmes</div>
        <br/></span>
        `))

    if(typeof problem_statement !== 'undefined'){
        trace_contents.append($(`<div class="problem-statement animate-fade-in"><div><b>Problem statement:</b></div> <div id="problem_statement_div"> ${problem_statement} </div></div><br/>`))
    }


    let unit_test = correction_data['unit_test_string']
    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    trace_contents.append($(`
<div class="unit-test">
    <div><b>When we run the code with this unit test:</b></div>
    <div><b>We get this output:</b></div>
    <div>${unit_test}</div>
    <div><span class = 'student-output-text'>${student_output}</span></div>
</div><br>
    `))


    let slider_id = `trace-slider-correction`
    let slider = $('<div/>', {class: 'trace-slider', id: slider_id})



    let comparison_div = $('<div/>', {class: 'comparison-div'})
    trace_contents.append(comparison_div)

    comparison_div.append(before_pre)
    comparison_div.append(slider)
    // comparison_div.append(`<button id="play-trace-button">&#9205;</button>`)
    comparison_div.append(after_pre)
    comparison_div.append(`<div id="follow_slider" class="hidden" style="position:absolute;">
        <button onclick="request_direction_feedback()">This one!</button></div>`)

    let update_listener = function( event, ui ) {
        let op_index = ui.value
        let trace_to_use =  $('.comparison-div').hasClass('full-view')?full_synced_trace:student_trace
        update_values_shown(before_pre, after_pre, trace_to_use, op_index)
        console.log( step_data['synced_trace'][op_index])


        log_custom_event('runtime_slider', {
            'op_index': op_index,
            'trace_value': trace_to_use[op_index]
        })

        // move follow_slider div to follow the slider handle
        // (do it with a zero timeout to resolve slider position first)
        setTimeout( function(){
            var handleOffset = $('.ui-slider-handle').offset();
                $('#follow_slider').css({
                    'top':handleOffset.top+25,
                    'left': handleOffset.left-20
                })
            }, 0)
    }

    // initial slider placement - last step in student code (step with output)
    slider_initial = step_data['synced_trace'].findLastIndex((t)=>t['before'])

    // use negative step values for the slider to make it go from top to bottom
    slider.slider({
        // orientation: "vertical",
        range: "min",
        max: step_data['synced_trace'].length-1,
        min: 0,
        value: slider_initial,
        change: update_listener,
        slide: update_listener
    });

    let ticks = $('<div/>', {class:'ticks'})
    for(let i=0; i < step_data['synced_trace'].length; i++) {
        op = step_data['synced_trace'][i]
        let before_line_class = "no-op-line"
        if(op['before']) {
            if(op['before']['values'].length <= 0 || op['value_matches']) {
                before_line_class = "op-line"
            }
            else {
                before_line_class = "bad-value-op-line"
                if(op['after']){
                    before_line_class = "value-mismatch-op-line"
                }
            }
        }

        let after_line_class = "no-op-line"
        if(op['after']) {
            if(op['after']['values'].length <= 0 || op['value_matches']) {
                after_line_class = "op-line"
            }
            else {
                after_line_class = "bad-value-op-line"
                if(op['before']){
                    after_line_class = "value-mismatch-op-line"
                }
            }
        }

        tick_class = (before_line_class == "no-op-line")? "no-before": ""

        ticks.append($(`
<span class="tick ${tick_class}" data-synced-index="${i}">
    <svg width="3" height="100%">
        <line x1="0" y1="0" x2="0" y2="10" class="${before_line_class} before-tick-line"></line>
        <line x1="0" y1="30" x2="0" y2="40" class="${after_line_class} after-tick-line"></line>
    </svg>
</span>`))

    }
    slider.append(ticks)

    return trace_contents
}

function simplify_trace(){
    trace = correction_data['synced_trace']

    keep_going = true
    while(keep_going){
        keep_going = false

        // check for pattern - first four ops seem to be an import
        if( trace.length >= 4 &&
            trace[0].before && trace[0].before.op.startsWith('LOAD_CONST') &&
            trace[0].after && trace[0].after.op.startsWith('LOAD_CONST') &&
            trace[1].before && trace[1].before.op.startsWith('LOAD_CONST') &&
            trace[1].after && trace[1].after.op.startsWith('LOAD_CONST') &&
            trace[2].before && trace[2].before.op.startsWith('IMPORT_NAME') &&
            trace[2].after && trace[2].after.op.startsWith('IMPORT_NAME') &&
            trace[3].before && trace[3].before.op.startsWith('STORE_NAME') &&
            trace[3].after && trace[3].after.op.startsWith('STORE_NAME')
        ){
            trace = trace.slice(4)
            console.log('removed import')
            keep_going = true // we removed something, keep going
        }

        // check for pattern - first four ops seem to be calling the function being tested
        else if( trace.length >= 4 &&
            trace[0].before && trace[0].before.op.startsWith('LOAD_CONST') &&
            trace[0].after && trace[0].after.op.startsWith('LOAD_CONST') &&
            trace[1].before && trace[1].before.op.startsWith('MAKE_FUNCTION') &&
            trace[1].after && trace[1].after.op.startsWith('MAKE_FUNCTION') &&
            trace[2].before && trace[2].before.op.startsWith('STORE_NAME') &&
            trace[2].after && trace[2].after.op.startsWith('STORE_NAME') &&
            trace[3].before && trace[3].before.op.startsWith('LOAD_CONST') &&
            trace[3].after && trace[3].after.op.startsWith('LOAD_CONST')
        ){
            trace = trace.slice(4)
            console.log('removed function call(with import?)')
            keep_going = true // we removed something, keep going
        }

        // check for pattern - first four ops seem to be calling the function being tested
        else if( trace.length >= 4 &&
            trace[0].before && trace[0].before.op.startsWith('LOAD_CONST') &&
            trace[0].after && trace[0].after.op.startsWith('LOAD_CONST') &&
            trace[1].before && trace[1].before.op.startsWith('LOAD_CONST') &&
            trace[1].after && trace[1].after.op.startsWith('LOAD_CONST') &&
            trace[2].before && trace[2].before.op.startsWith('MAKE_FUNCTION') &&
            trace[2].after && trace[2].after.op.startsWith('MAKE_FUNCTION') &&
            trace[3].before && trace[3].before.op.startsWith('STORE_NAME') &&
            trace[3].after && trace[3].after.op.startsWith('STORE_NAME')
        ){
            trace = trace.slice(4)
            console.log('removed function call (without import?)')
            keep_going = true // we removed something, keep going
        }
    }
    correction_data['synced_trace'] = trace
}

// Flatten the nested AST representation of the code to just the text,
// except add "evaluated_expression" tag to the specific node requested
function flatten_code_retain_node(code_selector, node_selector){
    // Clone the container to avoid modifying the original during processing
    const $clone = $(`${code_selector}`).clone();

    $clone.find('.value').remove();  // remove the value text from the trace

    // Find and temporarily remove the element to preserve
    const $preserveElement = $clone.find(node_selector);
    const preserveElementText = $preserveElement.length ? $preserveElement.text(): '';

    if ($preserveElement.length) {
        $preserveElement.replaceWith('__PRESERVE_ELEMENT_PLACEHOLDER__');
    }


    // Get text content of everything else
    const textContent = $clone.text();

    // If we had a preserved element, put it back
    if ($preserveElement.length) {
        return textContent.replace('__PRESERVE_ELEMENT_PLACEHOLDER__', `<evaluated_expression>${preserveElementText}</evaluated_expression>`);
    } else {
        return textContent;
    }

}

function get_short_trace_info(){
  short_trace = correction_data['synced_trace'].map((step) => {
    let before = null
    if(step['before']) {
      before = {
        'values': step['before']['values'],
        'code': flatten_code_retain_node('#before_block', '#student_code_'+ step['before']['node'])// $('#student_code_'+ step['before']['node'] +' .text-span').text()
      }
    }

    let after = null
    if(step['after']) {
      after = {
        'values': step['after']['values'],
        'code': flatten_code_retain_node('#after_block', '#corrected_code_'+ step['after']['node'])  // $('#corrected_code_'+ step['after']['node'] +' .text-span').text()
      }
    }

    let value_matches = step['value_matches']
    let value_mismatch = step['value_mismatch']
    if(step['before'] && step['after'] && step['before']['values'].length==0 && step['after']['values'].length==0 ) {
        // value_matches and value_mismatch are not meaningful when both values are missing/empty.
        value_matches = null
        value_mismatch = null
    }

    return {
      'before': before,
      'after': after,
      'value_matches': value_matches,
      'value_mismatch': value_mismatch
    }
  });


  result =  {
      'trace': short_trace,
      'points_of_interest': correction_data['points_of_interest']
  }


  return result
}

function get_correct_code_trace(){
    let all_trace_data = get_short_trace_info();
    let correct_code_trace = []
    let original_indices = []
    for(let i=0; i<all_trace_data['trace'].length; i++) {
        if(all_trace_data['trace'][i]['after'] !== null) {
            trace_node = all_trace_data['trace'][i]['after']
            correct_code_trace.push(trace_node)
            original_indices.push(i)
        }
    }
    return {
        trace: correct_code_trace,
        original_indices: original_indices
    }
}

let full_synced_trace, student_trace;

// Functions that set up each type of step: (observation, direction, diagnostic action) x (interactive or conversational)
// Each function:
// (1) adds the proper step html using add_step
// (2) returns a promise which will resolve to key-value pairs of steps so far (to pass on to next step)

function make_observation_inter(){

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()
    let correct_output = correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()

    // Add the step HTML
    add_step(`<h4>Step 1. How is the output wrong?</h4>
        <div id="observation-text" class="loading-placeholder loading-line"> </div>

        <div class="understanding_check"> <b>Do you see what I mean?</b> <span class="understanding-check-text">Click on the part of the problem statement which best explains why we expected the code to return <code>${correct_output}</code>.</span> <span class="arrow-start"></span>
        <br/><div id="step1_check_feedback"></div>
        </div>`, "observation", false)

    // Set up and return promise which will resolve to the output of the observation step (i.e. the observation)
    if (student_output.startsWith('Exception')) {
        // If this bug results in an exception, we first have to set up the understanding check.
        // This ensures that the understanding question is already prepared when the observation is displayed.
        return request_exception_check().then(data => {
            log_hovers(".student-output-text>span") // presumably there are spans in the exception message now, so log them
            return request_observation()
        })
    }
    else {
        // If this is not an exception, then the understanding check is already prepared
        // (the input data defines it, since it depends on the problem and the failing unit test, and is independent of the bug/student input)
        return request_observation()
    }
}

function make_observation_convo() {

    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()
    let correct_output = correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()

    // Set up manual promise and pipe through access to its resolve/reject functions
    let fo_resolve, fo_reject;
    let finish_obs_promise = new Promise((res, rej) =>{
        fo_resolve = res;
        fo_reject = rej;
    })

    // set up chat history variable
    let observation_chat_history = []


    // Add the step HTML (conversation about observation)

    let observation_question =  (student_output.startsWith('Exception:')?"Can you rephrase what the exception message is saying in plain English?":
    `Can you explain why the problem expects the code to return ${correct_output} and not ${student_output} in this case?`)

    add_step(`<h4>Step 1. How is the output wrong?</h4>
        <div id="observation-conversation">
        <div class="tutor initial">Before we start analyzing the code, let's make sure we understand what happens when we run this unit test, and how it's wrong. <span><b>${observation_question}</b></span></div>
        </div>

        <span id="student-observation-input">
        <textarea id="student-observation-box" name="observation" rows="3" cols="80"></textarea>
        <button id="obs-convo-send">Send</button>
        </span>`
        , "observation", false)

    $('#obs-convo-send').click(() => {
          request_observation_response(observation_chat_history, fo_resolve);
    });

    // start the "chat history" for the observation chat - pick up the intro text fom the step:
    // TODO: make global observation_chat_history variable, or something else? local to make_* (with closure)?
    observation_chat_history.push({
        "role": "model",
        "parts": [{text: $('[data-step-name="observation"] .tutor.initial').text()}]
    })

    return finish_obs_promise
}

function make_direction_inter(obs_promise, trace_promise) {
    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()
    let correct_output = correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()

    // Add the step HTML (immediately when make function is called)
    add_step(`<h4>Step 2. What should we look into?</h4>
        <div id="direction-text" class="loading-placeholder loading-line"> </div>
        <div class="understanding_check"><span class="understanding-check-text loading-placeholder loading-line"></span> <span class="arrow-start"></span>
        <br/><div id="step2_check_feedback"></div>
        </div>
        `, "direction", false)

    // request generation of the direction statement once the observation resolved
    let direction_promise = obs_promise.then(obs_output => request_direction(obs_output))

    // once both the direction statement and the trace promise are resolved, use those to generate the understanding question
    Promise.all([direction_promise, trace_promise])
    .then(([diagnostic_responses, descriptive_synced_trace]) =>
        request_direction_question(diagnostic_responses, descriptive_synced_trace)
    )

    return direction_promise
}

function make_direction_convo(obs_promise){

    // Set up promise to be manually resolved when the conversation is over
    let fd_resolve, fd_reject;
    let finish_dir_promise = new Promise((res, rej) => {
        fd_resolve = res
        fd_reject = rej
    })

    // set up chat history tracking
    let direction_chat_history = []

    // Add HTML for the step
    add_step(`<h4>Step 2. What should we look into?</h4>
        <div id="direction-conversation">
        <div class="tutor initial">Before we jump into analyzing the code, let's make sure we have a good plan about what to investigate. Looking over the code, <b>what questions should we be asking</b> to figure out what happened when the code ran with this particular unit test? Or, <b>what values or calcuations </b>might have contributed to the incorrect output?</div>
        </div>

        <span id="student-direction-input">
        <textarea id="student-direction-box" name="direction" rows="3" cols="80">We should try to find out...</textarea>
        <button id="dir-convo-send">Send</button>
        </span>
        `, "direction", false)

    $('#dir-convo-send').click(() => {
        // currently, the only reason we need prev_output to start this conversation is in order to pass along the previous output
        // so we can append to it, and return it when THIS step's promise is resolved, in case subsequent steps want to use that information.
        // Note that it should never happen that we need to request a response to THIS conversation while the previous step is not finished (and therefore obs_promise is not resolved).
        // So obs_promise should already be resolved by the time the user triggers this click handler, we just need to know what its output was.
        obs_promise.then( prev_output => request_direction_response(direction_chat_history, fd_resolve, prev_output));
    });

    // return the promise which will resolve when the direction conversation is over, and there is output to give.
    return finish_dir_promise
}

function make_action(prev_steps_promise, trace_promise, suggest_slice=true){
    // The "action" step always asks the student to investigate and then explain the bug in their own words;
    // So in that way, it's always conversational. For the interactive version, we also select and show a relevant slice of the code, and describe it.

    // set up manually-resolved promise
    let fa_resolve, fa_reject;
    let finish_action_promise = new Promise((res, rej) =>{
        fa_resolve = res;
        fa_reject = rej;
    })

    // If we are showing the slice, request trace slice once we have trace data AND output from previous steps
    if (suggest_slice) {
        Promise.all([prev_steps_promise, trace_promise]).then(([prev_output, full_trace]) =>
            request_trace_slice(prev_output, full_trace)
        )
    }

    // set up chat history tracking
    let action_chat_history = []

    // capture the sequence step parameter(for redirecting to next step):
    let sequence_step = (new URLSearchParams(window.location.search)).get('step')

    // TODO: some kind of call to action in "convo" version, without the trace slice?
    //  it used to say "Now, let's investigate using the execution trace! Use the trace slider below the code to step through what your program did when it ran this unit test."
    //  but this doesn't work as well when we actually just want them to look at the code in the easiest case, and not bother with the slider.
    add_step(`<h4>Step 3. Let's investigate!</h4>
        <div id="action-conversation">
            <div id="action-text" ${suggest_slice? 'class="loading-placeholder loading-line understanding_check"':''} >

            </div>

        <div class="tutor initial"><b>What do you think?</b> Can you explain why your code didn't do the right thing?</div>
        </div>
        <span id="student-action-input">
        <textarea id="student-action-box" name="action" rows="3" cols="80"></textarea>
        <button id="action-convo-send">Send</button>
        </span>
        <div id="sufficient_explanation" class="next-button hidden"><a href="/sequence?completed=${sequence_step}">Nice job! Click here to continue</a>
        </div>

        `, "action", false)

    $("#action-convo-send").click(() => {
        prev_steps_promise.then(prev_output => {
            request_action_response(action_chat_history, fa_resolve, prev_output)
        })
    })

    // hacks: remove "next" button or don't have one for step 3
    $('[data-step-name="action"] button.next-button').remove()
}

$(document).ready(function() {

    const urlParams = new URLSearchParams(window.location.search);

    // get URL parameters for how each step should be configured
    // (if not specified, assume "inter", i.e. the interactive interface which gives explanations and checks understanding)
    const step1 = urlParams.get('step1') || 'inter';
    const step2 = urlParams.get('step2') || 'inter';
    const step3 = urlParams.get('step3') || 'inter';


    // add path-data-polyfill library
    const polyfillScript = document.createElement('script');
    polyfillScript.src = 'https://cdn.jsdelivr.net/npm/path-data-polyfill@1.0.9/path-data-polyfill.min.js';
    polyfillScript.async = true;
    document.head.appendChild(polyfillScript);

    // add leaderline library
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/leader-line@1.0.7/leader-line.min.js';
    script.async = true;
    document.head.appendChild(script);

    simplify_trace()

    full_synced_trace = correction_data.synced_trace

    student_trace = correction_data.synced_trace.filter(step => step.before !== null)

    wrap_text_in_spans($('pre'), 'text-span')
    let trace_div = generate_view(correction_data)
    $('body').append(trace_div)
    $('body').append($(`<div id="conversation_div"></div>`))


    update_slider_indices()

    $('.trace-slider').each(function(){
        $(this).slider("value", $(this).slider("value"));
        //$(this).height($(this).parent().height()-10)
    })


    highlight_nodes()

    let correct_output = correction_data['synced_trace'].findLast((t)=>t['after'])['after']['values'].toString()
    let student_output = correction_data['synced_trace'].findLast((t)=>t['before'])['before']['values'].toString()

    // capture the sequence step parameter:
    let sequence_step = (new URLSearchParams(window.location.search)).get('step')

    $('body').append(`
    <div id="error_dialog" title="Error loading response">
  <p>Oops! An error occurred when trying to load a response from the bot.</p>
</div>`)
    $('#error_dialog').dialog({
        autoOpen: false
    })

    // add the debugging steps:

    let obs_result_promise, dir_result_promise;

    if (step1 === 'inter') {
        obs_result_promise = make_observation_inter()
    }
    else if (step1 === 'convo') {
        obs_result_promise = make_observation_convo()
    }
    else {
        // this step's configuration has some other value other than default/inter/convo
        // we should skip it
        obs_result_promise = Promise.resolve({})
    }
    // if step1 is something else (e.g. "skip"), then don't add a step 1.

    // start generating full trace analysis (we start it *after* step 1 because when the server can only do one thing at a time,
    // we prefer that it does step 1 first and then moves on to the trace, which won't be needed until the middle of step 2
    // TODO: are there instances where we don't need the trace analysis at all? probably not, arguably having the trace description available is always important
    let trace_promise = request_full_trace_analysis()

    // we need obs_result_promise to resolve, and tell us what the output of step 1 is, before we can generate content for step 2.
    // We also need the trace analysis to resolve before we can generate the direction understanding check (only in the interactive version)
    // however, we can *make* the (hidden) structure for the step (HTML, listeners) and then call appropriate functions when their prerequisites resolve
    if (step2 === 'inter') {
        dir_result_promise = make_direction_inter(obs_result_promise, trace_promise)
    }
    else if (step2 === 'convo') {
        dir_result_promise = make_direction_convo(obs_result_promise)
    }
    else {
        // this step's configuration has some other value other than default/inter/convo
        // we should skip it
        dir_result_promise = Promise.resolve({})
    }

    // Add the third (action) step and configure it
    if(step3 === 'inter') {
        make_action(dir_result_promise, trace_promise, true)
    }
    else if (step3 === 'convo') {
        make_action(dir_result_promise, trace_promise, false)
    }

    // start the first step.
    activate_next_step()

    dir_result_promise.then(data => console.log(data))

    // Add listeners for logging

    log_hovers(".ast-node")
    log_hovers("#problem_statement_div>span")
    log_clicks("button")

    // Pass along identifier parameter if it exists
    // TODO: could make this a function and call it in explanation.html, too.
    //   (needs to be in a file that explanation also imports)
    // const identifier = urlParams.get('identifier');
    // if (identifier) {
    //     document.querySelectorAll('a[href^="/sequence?"]').forEach(link => {
    //         const currentHref = link.getAttribute('href');
    //         link.setAttribute('href', `${currentHref}&identifier=${encodeURIComponent(identifier)}`);
    //     });
    // }
    propagate_sequence_params()
})

$(document).keydown(function(event) {
    if (event.key === '`') {
      $('.comparison-div').toggleClass('full-view');
      $('body').css('height', 'auto') // hack - remove the constraint that it should all be on one page if we turn on debugging mode
        // (note that this is never put back)
      update_slider_indices()
    }
});

function update_slider_indices(){
    let trace_to_use =  $('.comparison-div').hasClass('full-view')?full_synced_trace:student_trace
    $('#trace-slider-correction').slider("option", "max", trace_to_use.length-1)

}


function add_step(step_html, step_name, show_next_button = false){
    next_button = `<button class="next-button ${show_next_button?"":"hidden"}" onclick="activate_next_step()">Next Step</button>`
    $('#conversation_div').append(`<div class="explanation" data-step-name="${step_name}">${step_html}${next_button}</div>`)
}

function activate_next_step(){
    if($('#conversation_div>.explanation.current-step').length === 0){
        // there aren't any current steps - use the first one
        new_step = $('#conversation_div>.explanation').first()
    }
    else{
        old_step = $('#conversation_div>.explanation.current-step')
        new_step = old_step.next()
        old_step.removeClass('current-step')
    }
    new_step.addClass('current-step')
    step_name = new_step.attr('data-step-name')
    $('.trace-div').attr('data-current-step', step_name)

    // start appropriate understanding-check questions:
    if(step_name === "direction"){
        start_direction_check()
    }
    if(step_name === "action")
    {
        start_action_check()
    }

}

function drawTransientArrow(startElement, endElement, path="magnet"){

    // add class to pulse border
    endElement.classList.add('active-check');

    // scroll end element into view
    endElement.scrollIntoView({behavior:'smooth'})
    setTimeout(function() {

        // Create a new leader line with draw animation
        const line = new LeaderLine(
            startElement,
            endElement,
            {
            path: path,
            startSocket: 'right',
            endSocket: 'bottom',
            size: 3,
            startPlug: 'behind',
            endPlug: 'arrow1',
            color: '#ff7f50', // This is the default color but let's hardcode it so it matches border animation.
            animated: false, // Set to false initially
            hide: true // Create the line hidden initially
            }
        );

        // Show with draw animation
        line.show('draw', {
            duration: 1000,
            timing: 'linear'
        });

        // Wait for draw animation to complete, then fade out
        setTimeout(function() {
            // Hide with fade animation
            line.hide('fade', {
            duration: 800,
            timing: 'linear'
            });

            // Wait for fade animation to complete, then remove
            setTimeout(function() {
            line.remove();
            }, 800); // Same as the fade duration

        }, 1500); // Draw duration (1000ms) + small buffer (500ms)
    }, 1500); // Delay: don't start drawing until element starts fading in

  // return line;

}
