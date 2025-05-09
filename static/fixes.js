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

$(document).ready(function() {
    

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

    // add the debugging steps:

    // add_step(`<h4>Step 1. Run the code with one of the broken unit tests</h4> Let's see what happens when we run: <pre>${correction_data['unit_test_string']}</pre>`, add_next_button = true)

    add_step(`<h4>Step 1. How is the output wrong?</h4>
        <div id="observation-text" class="loading-placeholder loading-line"> </div>

        <div class="understanding_check"> <b>Do you see what I mean?</b> <span class="understanding-check-text">Click on the part of the problem statement which best explains why we expected the code to return <code>${correct_output}</code>.</span> <span class="arrow-start"></span>
        <br/><div id="step1_check_feedback"></div>
        </div>`, step_name="observation", show_next_button = false)

    add_step(`<h4>Step 2. What should we look into?</h4>
        <div id="direction-text" class="loading-placeholder loading-line"> </div>
        <div class="understanding_check"><span class="understanding-check-text loading-placeholder loading-line"></span> <span class="arrow-start"></span>
        <br/><div id="step2_check_feedback"></div>
        </div>
        `, step_name="direction", show_next_button = false)

    add_step(`<h4>Step 3. Let's investigate!</h4>
        <div id="action-text" class="loading-placeholder loading-line"> </div>
        <div class="understanding_check">
        <span id="explanation_question_span">
        <div><b>What do you think?</b> Can you explain why your code didn't do the right thing?</div>
        <textarea id="student-explanation" name="explanation" rows="3" cols="80"></textarea> 
        <button onclick="request_explanation_feedback()">Send</button>
        </span>
        <br/>
        <div id="step3_check_feedback"></div>
        <div id="improve_explanation" class="hidden">Edit your explanation to incorporate this feedback</div>
        <div id="sufficient_explanation" class="hidden">Nice job!</div>
        </div>
        `, step_name = "action")

    activate_next_step()

    // Set up generating diagnostic messages (steps 1 and 2):
    let diagnostic_promise;
    if(student_output.startsWith('Exception')){
        // need to do the exception check loading before diagnostics, otherwise there are no spans to split in the exception message
        diagnostic_promise = request_exception_check().then(data => request_diagnostics())
    }
    else {
        diagnostic_promise = request_diagnostics()
    }
    
    // create promise chain of generating guidance strings that depend on each other:
    Promise.all([diagnostic_promise, request_full_trace_analysis()])
    .then(([diagnostic_responses, descriptive_synced_trace]) => {
        console.log(diagnostic_responses)
        console.log(descriptive_synced_trace)
        request_trace_slice(diagnostic_responses, descriptive_synced_trace)
        request_direction_question(diagnostic_responses, descriptive_synced_trace)
    })
    .catch(error => {
        console.error('One of the fetches failed:', error);
    });
    
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
    if(step_name == "direction"){
        start_direction_check()
    }
    if(step_name == "action")
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