import { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Save, XCircle, Layers, List, Tag } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
 
const defaultFields = [
  { id: 'subject', label: 'Subject', type: 'text', required: true },
  { id: 'description', label: 'Description', type: 'textarea', required: true },
  { id: 'typeOfIssue', label: 'Type of Issue', type: 'dropdown', required: true, options: ['Incident', 'Service request', 'Change request'] },
];
 
const toObjArr = (arr) => (arr || []).map(val =>
  typeof val === 'object'
    ? { id: uuidv4(), value: val.value, color: val.color || '#888' }
    : { id: uuidv4(), value: val, color: '#888' }
);
const toStrArr = arr => (arr || []).map(obj => obj.value);
const toDropdownArr = arr => (arr || []).map(obj => ({ value: obj.value, color: obj.color }));
 
export default function EditTicketForm() {
  const [fields, setFields] = useState(defaultFields.filter(f => f.id !== 'priority'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [moduleOptions, setModuleOptions] = useState(toObjArr(['EWM', 'BTP', 'TM']));
  const [categoryOptions, setCategoryOptions] = useState({
    EWM: toObjArr(['Inbound', 'Outbound', 'Internal']),
    BTP: toObjArr(['d', 'e', 'f']),
    TM: toObjArr(['g', 'h', 'i'])
  });
  const [subCategoryOptions, setSubCategoryOptions] = useState({
    Inbound: toObjArr(['Putaway', 'Goods Receipt']),
    Outbound: toObjArr(['Picking', 'Packing']),
    Internal: toObjArr(['Stock Transfer']),
    d: toObjArr(['d1', 'd2']),
    e: toObjArr(['e1', 'e2']),
    f: toObjArr(['f1', 'f2']),
    g: toObjArr(['g1', 'g2']),
    h: toObjArr(['h1', 'h2']),
    i: toObjArr(['i1', 'i2'])
  });
  const [editFieldIdx, setEditFieldIdx] = useState(null);
  const [editModuleIdx, setEditModuleIdx] = useState(null);
  const [editCategory, setEditCategory] = useState({ mod: null, idx: null });
  const [editSubCategory, setEditSubCategory] = useState({ cat: null, idx: null });
 
  // Load config from Firestore
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const configRef = doc(db, 'config', 'formConfig');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          // All dropdown fields: support color
          const loadedFields = configSnap.data().fields || defaultFields;
          setFields(loadedFields.map(f => {
            if (f.type === 'dropdown' && Array.isArray(f.options)) {
              return { ...f, options: toObjArr(f.options) };
            }
            return f;
          }));
          setModuleOptions(toObjArr(configSnap.data().moduleOptions || ['EWM', 'BTP', 'TM']));
          const catOpt = {};
          Object.entries(configSnap.data().categoryOptions || {}).forEach(([mod, arr]) => {
            catOpt[mod] = toObjArr(arr);
          });
          setCategoryOptions(catOpt);
          const subOpt = {};
          Object.entries(configSnap.data().subCategoryOptions || {}).forEach(([cat, arr]) => {
            subOpt[cat] = toObjArr(arr);
          });
          setSubCategoryOptions(subOpt);
        } else {
          // If not exists, create default
          await setDoc(configRef, {
            fields: defaultFields,
            moduleOptions: ['EWM', 'BTP', 'TM'],
            categoryOptions: { EWM: ['Inbound', 'Outbound', 'Internal'], BTP: ['d', 'e', 'f'], TM: ['g', 'h', 'i'] },
            subCategoryOptions: { Inbound: ['Putaway', 'Goods Receipt'], Outbound: ['Picking', 'Packing'], Internal: ['Stock Transfer'], d: ['d1', 'd2'], e: ['e1', 'e2'], f: ['f1', 'f2'], g: ['g1', 'g2'], h: ['h1', 'h2'], i: ['i1', 'i2'] }
          });
          setModuleOptions(toObjArr(['EWM', 'BTP', 'TM']));
          setCategoryOptions({ EWM: toObjArr(['Inbound', 'Outbound', 'Internal']), BTP: toObjArr(['d', 'e', 'f']), TM: toObjArr(['g', 'h', 'i']) });
          setSubCategoryOptions({ Inbound: toObjArr(['Putaway', 'Goods Receipt']), Outbound: toObjArr(['Picking', 'Packing']), Internal: toObjArr(['Stock Transfer']), d: toObjArr(['d1', 'd2']), e: toObjArr(['e1', 'e2']), f: toObjArr(['f1', 'f2']), g: toObjArr(['g1', 'g2']), h: toObjArr(['h1', 'h2']), i: toObjArr(['i1', 'i2']) });
        }
      } catch {
        setStatus('Failed to load config');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);
 
  // Field Handlers
  const addField = () => {
    setFields([
      ...fields,
      { id: 'field_' + Date.now(), label: 'New Field', type: 'text', required: false }
    ]);
  };
  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };
  const updateField = (index, key, value) => {
    setFields(fields.map((f, i) => {
      if (i === index) {
        let newId = f.id;
        if (key === 'label' && typeof value === 'string' && value.trim().toLowerCase() === 'priority') {
          newId = 'priority';
        }
        return { ...f, [key]: value, id: newId };
      }
      return f;
    }));
  };
  // All dropdowns: add option with color
  const addOption = (index) => {
    setFields(fields.map((f, i) => {
      if (i === index) {
        if (f.type === 'dropdown') {
          return {
            ...f,
            options: [
              ...(f.options || []),
              { value: 'New Option', color: '#888', id: uuidv4() }
            ]
          };
        } else {
          return { ...f, options: [...(f.options || []), 'New Option'] };
        }
      }
      return f;
    }));
  };
  // All dropdowns: update option value or color
  const updateOption = (fieldIdx, optIdx, value, color) => {
    setFields(fields.map((f, i) => {
      if (i === fieldIdx) {
        if (f.type === 'dropdown') {
          return {
            ...f,
            options: f.options.map((o, j) =>
              j === optIdx ? { ...o, value: value !== undefined ? value : o.value, color: color !== undefined ? color : o.color } : o
            )
          };
        } else {
          return { ...f, options: f.options.map((o, j) => j === optIdx ? value : o) };
        }
      }
      return f;
    }));
  };
  // All dropdowns: remove option
  const removeOption = (fieldIdx, optIdx) => {
    setFields(fields.map((f, i) => {
      if (i === fieldIdx) {
        if (f.type === 'dropdown') {
          return { ...f, options: f.options.filter((_, j) => j !== optIdx) };
        } else {
          return { ...f, options: f.options.filter((_, j) => j !== optIdx) };
        }
      }
      return f;
    }));
  };
 
  // Module Handlers
  const addModule = () => setModuleOptions([...moduleOptions, { id: uuidv4(), value: 'New Module' }]);
  const updateModule = (idx, value) => {
    const newModules = [...moduleOptions];
    newModules[idx].value = value;
    setModuleOptions(newModules);
  };
  const removeModule = idx => {
    const mod = moduleOptions[idx].value;
    setModuleOptions(moduleOptions.filter((_, i) => i !== idx));
    const newCat = { ...categoryOptions };
    delete newCat[mod];
    setCategoryOptions(newCat);
  };
 
  // Category Handlers
  const addCategory = mod => setCategoryOptions({ ...categoryOptions, [mod]: [...(categoryOptions[mod] || []), { id: uuidv4(), value: 'New Category' }] });
  const updateCategory = (mod, cidx, value) => {
    const newCats = [...(categoryOptions[mod] || [])];
    newCats[cidx].value = value;
    setCategoryOptions({ ...categoryOptions, [mod]: newCats });
  };
  const removeCategory = (mod, cidx) => {
    const cat = categoryOptions[mod][cidx].value;
    const newCats = (categoryOptions[mod] || []).filter((_, i) => i !== cidx);
    setCategoryOptions({ ...categoryOptions, [mod]: newCats });
    const newSub = { ...subCategoryOptions };
    delete newSub[cat];
    setSubCategoryOptions(newSub);
  };
 
  // Sub-Category Handlers
  const addSubCategory = cat => setSubCategoryOptions({ ...subCategoryOptions, [cat]: [...(subCategoryOptions[cat] || []), { id: uuidv4(), value: 'New Sub-Category' }] });
  const updateSubCategory = (cat, sidx, value) => {
    const newSubs = [...(subCategoryOptions[cat] || [])];
    newSubs[sidx].value = value;
    setSubCategoryOptions({ ...subCategoryOptions, [cat]: newSubs });
  };
  const removeSubCategory = (cat, sidx) => {
    const newSubs = (subCategoryOptions[cat] || []).filter((_, i) => i !== sidx);
    setSubCategoryOptions({ ...subCategoryOptions, [cat]: newSubs });
  };
 
  // Save config to Firestore
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const configRef = doc(db, 'config', 'formConfig');
      // Convert object arrays to string arrays for Firestore
      const modStr = toStrArr(moduleOptions);
      const catStr = {};
      Object.entries(categoryOptions).forEach(([mod, arr]) => { catStr[mod] = toStrArr(arr); });
      const subStr = {};
      Object.entries(subCategoryOptions).forEach(([cat, arr]) => { subStr[cat] = toStrArr(arr); });
      // For fields, convert dropdown options to {value, color}, others to string
      const saveFields = fields.map(f => {
        if (f.type === 'dropdown') {
          return { ...f, options: toDropdownArr(f.options) };
        } else {
          return { ...f, options: toStrArr(f.options) };
        }
      });
      await setDoc(configRef, { fields: saveFields.filter(f => !['module','category','subCategory'].includes(f.id)), moduleOptions: modStr, categoryOptions: catStr, subCategoryOptions: subStr });
      setStatus('Saved!');
    } catch {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 2000);
    }
  };
 
  if (loading) return <div className="flex flex-col items-center justify-center min-h-[40vh] text-blue-600"><span className="animate-spin h-8 w-8 mb-2 border-4 border-blue-300 border-t-blue-600 rounded-full inline-block"></span> Loading form config...</div>;
 
  return (
    <div className="max-w-4xl mx-auto p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl shadow-2xl border mt-8">
      <h2 className="text-3xl font-bold mb-8 flex items-center gap-3"><Layers className="w-7 h-7 text-blue-600" /> Edit Ticket Form</h2>
      <form onSubmit={handleSave}>
        {/* Fields Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-5 h-5 text-indigo-500" />
            <h3 className="text-xl font-semibold">Ticket Fields</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fields.filter(f => !['module','category','subCategory'].includes(f.id)).map((field, idx) => (
              <div key={field.id} className="bg-white rounded-xl shadow p-4 flex flex-col gap-2 border border-gray-100 relative">
                {editFieldIdx === idx ? (
                  <>
                    <input
                      className="border rounded px-2 py-1 flex-1 mb-2"
                      value={field.label}
                      onChange={e => updateField(idx, 'label', e.target.value)}
                      placeholder="Field Label"
                    />
                    <select
                      className="border rounded px-2 py-1 mb-2"
                      value={field.type}
                      onChange={e => updateField(idx, 'type', e.target.value)}
                    >
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs mb-2">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={e => updateField(idx, 'required', e.target.checked)}
                      />
                      Required
                    </label>
                    {field.type === 'dropdown' && (
                      <div className="ml-2 space-y-1">
                        <div className="flex gap-2 items-center mb-1">
                          <span className="font-semibold text-xs">Options:</span>
                          <button className="text-blue-600 text-xs flex items-center gap-1" onClick={() => addOption(idx)} type="button"><Plus className="w-4 h-4" />Add</button>
                        </div>
                        {(field.options || []).map((opt, optIdx) => (
                          <div key={opt.id || optIdx} className="flex gap-2 items-center">
                            <input
                              className="border rounded px-2 py-1 flex-1"
                              value={typeof opt === 'object' ? opt.value : opt}
                              onChange={e => updateOption(idx, optIdx, e.target.value, undefined)}
                              placeholder="Option"
                            />
                            {/* Color picker for all dropdowns */}
                            <input
                              type="color"
                              className="w-8 h-8 p-0 border-0 bg-transparent cursor-pointer"
                              value={opt.color || '#888'}
                              onChange={e => updateOption(idx, optIdx, undefined, e.target.value)}
                              title="Pick color"
                            />
                            <button className="text-red-400 text-xs flex items-center gap-1" onClick={() => removeOption(idx, optIdx)} type="button"><Trash2 className="w-4 h-4" />Remove</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button className="bg-green-500 text-white px-3 py-1 rounded flex items-center gap-1" type="button" onClick={() => setEditFieldIdx(null)}><Save className="w-4 h-4" />Save</button>
                      <button className="bg-gray-200 text-gray-700 px-3 py-1 rounded flex items-center gap-1" type="button" onClick={() => setEditFieldIdx(null)}><XCircle className="w-4 h-4" />Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-800">{field.label}</span>
                      <span className="text-xs text-gray-400">({field.type})</span>
                      {field.required && <span className="text-xs text-red-500 font-bold ml-2">*</span>}
                    </div>
                    {field.type === 'dropdown' && (
                      <div className="ml-2 text-xs text-gray-500 flex flex-col gap-1">
                        {(field.options || []).map((opt, optIdx) => (
                          <div key={opt.id || optIdx} className="flex items-center gap-2">
                            <span>{opt.value}</span>
                            <input
                              type="color"
                              className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                              value={opt.color || '#888'}
                              onChange={e => updateOption(idx, optIdx, undefined, e.target.value)}
                              title="Pick color"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-2">
                      <button className="text-blue-500 hover:text-blue-700" type="button" onClick={() => setEditFieldIdx(idx)}><Edit2 className="w-4 h-4" /></button>
                      <button className="text-red-400 hover:text-red-600" type="button" onClick={() => removeField(idx)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 shadow hover:bg-blue-700" onClick={addField} type="button"><Plus className="w-5 h-5" />Add Field</button>
        </div>
        {/* Cascading Dropdowns Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <List className="w-5 h-5 text-indigo-500" />
            <h3 className="text-xl font-semibold">Cascading Dropdowns</h3>
          </div>
          {/* Modules Management */}
          <div className="bg-white rounded-xl shadow p-4 mb-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-2 font-semibold text-gray-700"><Layers className="w-4 h-4 text-blue-500" />Modules</div>
            <ul className="mb-2">
              {moduleOptions.map((mod, idx) => (
                <li key={mod.id} className="flex items-center gap-2 mb-1">
                  {editModuleIdx === idx ? (
                    <input
                      className="border rounded px-2 py-1 flex-1"
                      value={mod.value}
                      onChange={e => updateModule(idx, e.target.value)}
                    />
                  ) : (
                    <span className="font-medium text-gray-800 flex-1">{mod.value}</span>
                  )}
                  {editModuleIdx === idx ? (
                    <>
                      <button className="text-green-500" onClick={() => setEditModuleIdx(null)} type="button"><Save className="w-4 h-4" /></button>
                      <button className="text-gray-400" onClick={() => setEditModuleIdx(null)} type="button"><XCircle className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button className="text-blue-500" onClick={() => setEditModuleIdx(idx)} type="button"><Edit2 className="w-4 h-4" /></button>
                      <button className="text-red-500" onClick={() => removeModule(idx)} type="button"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <button className="text-blue-600 text-xs flex items-center gap-1" onClick={addModule} type="button"><Plus className="w-4 h-4" />Add Module</button>
          </div>
          {/* Categories Management */}
          <div className="bg-white rounded-xl shadow p-4 mb-6 border border-gray-100">
            <div className="flex items-center gap-2 mb-2 font-semibold text-gray-700"><List className="w-4 h-4 text-blue-500" />Categories per Module</div>
            {moduleOptions.map(mod => (
              <div key={mod.id} className="mb-2 ml-4">
                <div className="font-semibold text-sm mb-1 flex items-center gap-2">{mod.value}</div>
                <ul>
                  {(categoryOptions[mod.value] || []).map((cat, cidx) => (
                    <li key={cat.id} className="flex items-center gap-2 mb-1">
                      {editCategory.mod === mod.value && editCategory.idx === cidx ? (
                        <input
                          className="border rounded px-2 py-1 flex-1"
                          value={cat.value}
                          onChange={e => updateCategory(mod.value, cidx, e.target.value)}
                        />
                      ) : (
                        <span className="flex-1">{cat.value}</span>
                      )}
                      {editCategory.mod === mod.value && editCategory.idx === cidx ? (
                        <>
                          <button className="text-green-500" onClick={() => setEditCategory({ mod: null, idx: null })} type="button"><Save className="w-4 h-4" /></button>
                          <button className="text-gray-400" onClick={() => setEditCategory({ mod: null, idx: null })} type="button"><XCircle className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button className="text-blue-500" onClick={() => setEditCategory({ mod: mod.value, idx: cidx })} type="button"><Edit2 className="w-4 h-4" /></button>
                          <button className="text-red-500" onClick={() => removeCategory(mod.value, cidx)} type="button"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <button className="text-blue-600 text-xs flex items-center gap-1" onClick={() => addCategory(mod.value)} type="button"><Plus className="w-4 h-4" />Add Category</button>
              </div>
            ))}
          </div>
          {/* Sub-Categories Management */}
          <div className="bg-white rounded-xl shadow p-4 border border-gray-100">
            <div className="flex items-center gap-2 mb-2 font-semibold text-gray-700"><List className="w-4 h-4 text-blue-500" />Sub-Categories per Category</div>
            {Object.keys(categoryOptions).flatMap(mod => (categoryOptions[mod] || [])).map(cat => (
              <div key={cat.id} className="mb-2 ml-4">
                <div className="font-semibold text-sm mb-1 flex items-center gap-2">{cat.value}</div>
                <ul>
                  {(subCategoryOptions[cat.value] || []).map((sub, sidx) => (
                    <li key={sub.id} className="flex items-center gap-2 mb-1">
                      {editSubCategory.cat === cat.value && editSubCategory.idx === sidx ? (
                        <input
                          className="border rounded px-2 py-1 flex-1"
                          value={sub.value}
                          onChange={e => updateSubCategory(cat.value, sidx, e.target.value)}
                        />
                      ) : (
                        <span className="flex-1">{sub.value}</span>
                      )}
                      {editSubCategory.cat === cat.value && editSubCategory.idx === sidx ? (
                        <>
                          <button className="text-green-500" onClick={() => setEditSubCategory({ cat: null, idx: null })} type="button"><Save className="w-4 h-4" /></button>
                          <button className="text-gray-400" onClick={() => setEditSubCategory({ cat: null, idx: null })} type="button"><XCircle className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button className="text-blue-500" onClick={() => setEditSubCategory({ cat: cat.value, idx: sidx })} type="button"><Edit2 className="w-4 h-4" /></button>
                          <button className="text-red-500" onClick={() => removeSubCategory(cat.value, sidx)} type="button"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <button className="text-blue-600 text-xs flex items-center gap-1" onClick={() => addSubCategory(cat.value)} type="button"><Plus className="w-4 h-4" />Add Sub-Category</button>
              </div>
            ))}
          </div>
        </div>
        {/* Save Button & Status */}
        <div className="mt-8 text-right flex items-center gap-4 justify-end">
          {status && <span className={`text-sm ${status === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>{status}</span>}
          <button className="px-6 py-2 bg-green-600 text-white rounded-lg flex items-center gap-2 shadow hover:bg-green-700" type="submit" disabled={saving}>{saving ? 'Saving...' : (<><Save className="w-5 h-5" />Save Changes</>)}</button>
        </div>
      </form>
    </div>
  );
}