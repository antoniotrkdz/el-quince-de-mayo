import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Bold, Italic, List, ListOrdered, Undo, Redo } from 'lucide-react'

interface Props {
  content: string
  onChange?: (html: string) => void
  editable?: boolean
  placeholder?: string
}

export default function RichEditor({ content, onChange, editable = true, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Scrivi qui il contenuto della sezione...' }),
      CharacterCount,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  if (!editor) return null

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {editable && (
        <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Grassetto">
            <Bold size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Corsivo">
            <Italic size={14} />
          </ToolBtn>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Elenco puntato">
            <List size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Elenco numerato">
            <ListOrdered size={14} />
          </ToolBtn>
          <div className="w-px h-4 bg-gray-300 mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="Annulla">
            <Undo size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="Ripeti">
            <Redo size={14} />
          </ToolBtn>
          <div className="ml-auto text-xs text-gray-400">
            {editor.storage.characterCount?.characters()} caratteri
          </div>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-4 py-3 min-h-[200px] focus-within:outline-none"
      />
    </div>
  )
}

function ToolBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-200 transition ${active ? 'bg-gray-200 text-blue-600' : 'text-gray-600'}`}
    >
      {children}
    </button>
  )
}
