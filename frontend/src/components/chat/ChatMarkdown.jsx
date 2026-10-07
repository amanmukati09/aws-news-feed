import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export default function ChatMarkdown({ children }) {
  return (
    <div className="chat-answer prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
          code: ({ node, inline, className, children, ...props }) =>
            inline ? (
              <code className={className} {...props}>{children}</code>
            ) : (
              <pre className={className}>
                <code className={className} {...props}>{children}</code>
              </pre>
            ),
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
