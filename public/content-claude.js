(function () {
  chrome.storage.local.get(['claude_pending_message'], (result) => {
    const text = result.claude_pending_message
    if (!text) return

    chrome.storage.local.remove('claude_pending_message')

    const tryFill = (attempts) => {
      if (attempts <= 0) return

      // Claude.ai uses a contenteditable div with role="textbox" or a ProseMirror editor
      const editor =
        document.querySelector('[contenteditable="true"]') ||
        document.querySelector('div.ProseMirror') ||
        document.querySelector('[role="textbox"]')

      if (!editor) {
        setTimeout(() => tryFill(attempts - 1), 500)
        return
      }

      // Focus and set content
      editor.focus()

      // Use execCommand for contenteditable compatibility
      document.execCommand('insertText', false, text)

      // If execCommand didn't work, try direct manipulation
      if (!editor.textContent || editor.textContent.trim().length === 0) {
        editor.textContent = text
        editor.dispatchEvent(new Event('input', { bubbles: true }))
      }

      // Try to click the send button after a short delay
      setTimeout(() => {
        const sendButton =
          document.querySelector('button[aria-label="Send Message"]') ||
          document.querySelector('button[data-testid="send-button"]') ||
          // Fallback: find button with an SVG arrow icon near the editor
          document.querySelector('fieldset button:last-of-type') ||
          Array.from(document.querySelectorAll('button')).find(
            (b) => b.querySelector('svg') && b.closest('fieldset, form, [role="presentation"]')
          )

        if (sendButton && !sendButton.disabled) {
          sendButton.click()
        }
      }, 300)
    }

    // Wait for page to fully load, then try to fill
    if (document.readyState === 'complete') {
      setTimeout(() => tryFill(20), 1000)
    } else {
      window.addEventListener('load', () => setTimeout(() => tryFill(20), 1000))
    }
  })
})()
